import pkg from 'pg';
const { Pool } = pkg;
import type { QueryResult } from 'pg';

// Initialize Neon PostgreSQL connection pool for PMS database
const pmsDatabaseUrl = process.env.PMS_DATABASE_URL || process.env.DATABASE_URL!;

export const pmsPool = new Pool({
  connectionString: pmsDatabaseUrl,
  ssl: process.env.PMS_DISABLE_SSL === 'true' ? false : {
    rejectUnauthorized: false
  }
});

// PMS Project interface matching Supabase schema
export interface PMSProject {
  id: string;
  project_code: string;
  project_name: string;
  description?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  created_by_emp_code?: string;
  progress_percentage?: number;
  client_name?: string;
  department?: string | string[]; // Legacy single department field or new array
  departments?: string[] | string; // New multiple departments field (array or comma-separated string)
  dept?: string; // Alternative department field name
  department_name?: string; // Alternative department field name
}

// PMS Task interface matching Supabase schema
export interface PMSTask {
  id: string;
  project_id: string;
  key_step_id?: string;
  task_name: string;
  description?: string;
  priority?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  assignee?: string;
  task_members?: string[];
  created_at?: string;
  assigner_id?: string;
  updated_at?: string;
  progress?: number;
}

// PMS Subtask interface matching Supabase schema
export interface PMSSubtask {
  id: string;
  task_id: string;
  title: string;
  assigned_to?: string;
  is_completed?: boolean;
  progress?: number;
  created_at?: string;
}

// Department name normalization mapping
const normalizeDepartment = (dept: string): string => {
  const normalized = dept.toLowerCase().trim();
  // Map variations to standard department names
  const departmentMappings: Record<string, string> = {
    'software': 'software',
    'software developers': 'software',
    'software developer': 'software',
    'finance': 'finance',
    'purchase': 'purchase',
    'purchases': 'purchase',
    'hr': 'hr',
    'hr & admin': 'hr',
    'hr and admin': 'hr',
    'human resources': 'hr',
    'human resources & admin': 'hr',
    'operations': 'operations',
    'operation': 'operations',
    'marketing': 'marketing',
    'sales': 'sales',
    'admin': 'admin',
    'administration': 'admin',
    'it': 'it',
    'information technology': 'it',
    'qa': 'qa',
    'quality assurance': 'qa',
    'testing': 'qa',
    // presales variants
    'presale': 'presales',
    'presales': 'presales',
    'pre-sales': 'presales',
    'pre sales': 'presales',
  };

  return departmentMappings[normalized] || normalized;
};

// Check if two departments are equivalent
const isDepartmentMatch = (userDept: string, projectDept: string): boolean => {
  return normalizeDepartment(userDept) === normalizeDepartment(projectDept);
};

export const getProjects = async (userRole?: string, userEmpCode?: string, userDepartment?: string): Promise<PMSProject[]> => {
  try {
    console.log("🔍 PMS getProjects called with:", { userRole, userEmpCode, userDepartment });

    console.log("📡 Executing PMS query to fetch Projects with departments...");

    // Query Neon PostgreSQL directly - get all projects
    const projectsResult: QueryResult = await pmsPool.query(`
      SELECT 
        p.id,
        p.title as project_name,
        p.project_code,
        p.client_name,
        p.description,
        p.status,
        p.start_date,
        p.end_date,
        p.progress as progress_percentage,
        p.created_at,
        p.updated_at
      FROM projects p
      ORDER BY p.title
    `);

    const projects = projectsResult.rows as PMSProject[] || [];

    // Get all department assignments
    const deptResult: QueryResult = await pmsPool.query(`
      SELECT project_id, department FROM project_departments
    `);

    // Map departments to projects
    const projectDepts: Record<string, string[]> = {};
    deptResult.rows.forEach((row: any) => {
      const projId = row.project_id;
      if (!projectDepts[projId]) {
        projectDepts[projId] = [];
      }
      projectDepts[projId].push(row.department);
    });

    // Enrich projects with their departments
    const enrichedProjects = projects.map(p => ({
      ...p,
      department: projectDepts[p.id as any] || []
    }));

    console.log(`📊 PMS projects returned: ${enrichedProjects.length} projects`);
    if (enrichedProjects.length > 0) {
      console.log("📋 First project sample:", JSON.stringify(enrichedProjects[0], null, 2));
    } else {
      console.log("⚠️ No projects found in PMS database");
    }

    // Apply client-side department filtering if user has department (including admins)
    // ⚡ SPECIAL BYPASS: Admin (specifically E0001) sees ALL projects regardless of department
    const isAdmin = userRole === 'admin' || userEmpCode === 'E0001';
    
    if (userDepartment && !isAdmin) {
      console.log("🔄 Applying client-side department filtering for:", userDepartment);
      const filteredProjects = enrichedProjects.filter(project => {
        // Handle multiple possible department field names and formats
        let projectDepts: string[] = [];

        // Check for department array field (new multiple departments format)
        if (project.department && Array.isArray(project.department)) {
          projectDepts = project.department;
        }
        // Check for departments array field (alternative naming)
        else if (project.departments && Array.isArray(project.departments)) {
          projectDepts = project.departments;
        }
        // Check for single department field (legacy format)
        else if (typeof project.department === 'string') {
          projectDepts = [project.department];
        }
        else if (project.dept) {
          projectDepts = [project.dept];
        }
        else if (project.department_name) {
          projectDepts = [project.department_name];
        }
        // Check for comma-separated string in departments field
        else if (typeof project.departments === 'string') {
          projectDepts = project.departments.split(',').map((d: string) => d.trim());
        }

        if (projectDepts.length === 0) {
          console.log(`⚠️ Project ${project.project_name} has no department assigned`);
          return false; // Exclude projects without department
        }

        // Check if user's department matches any of the project's departments
        const isMatch = projectDepts.some(dept => isDepartmentMatch(userDepartment, dept));
        if (isMatch) {
          console.log(`✅ Project "${project.project_name}" depts [${projectDepts.join(', ')}] matches "${userDepartment}"`);
        }
        return isMatch;
      });

      console.log(`📊 After department filtering: ${filteredProjects.length} projects (from ${enrichedProjects.length})`);
      return filteredProjects;
    }

    return enrichedProjects;
  } catch (error) {
    console.error("💥 Error connecting to PMS:", error);
    return []; // Return empty array on connection issues
  }
};

export const getTasks = async (projectId?: string, userDepartment?: string, userEmpCode?: string, userRole?: string): Promise<PMSTask[]> => {
  try {
    console.log("📡 Executing PMS getTasks query for project:", projectId, "userRole:", userRole, "userEmpCode:", userEmpCode);
    const isAdmin = userRole === 'admin' || userEmpCode === 'E0001';

    let query = 'SELECT * FROM project_tasks ORDER BY task_name';
    const params: any[] = [];

    if (projectId) {
      // projectId is actually the project_code, need to join with projects table
      // and filter by user assignment if userEmpCode is provided
      query = `
        SELECT DISTINCT pt.* FROM project_tasks pt
        INNER JOIN projects p ON pt.project_id = p.id
        LEFT JOIN task_members tm ON pt.id = tm.task_id
        LEFT JOIN employees e ON tm.employee_id = e.id
        WHERE p.project_code = $1
          AND (pt.status IS NULL OR LOWER(pt.status) != 'completed')
          AND (LOWER(TRIM(e.emp_code)) = LOWER(TRIM($2)) OR $2 IS NULL OR $3 = TRUE)
        ORDER BY pt.task_name
      `;
      params.push(projectId, userEmpCode || null, isAdmin);
    } else if (userEmpCode && !isAdmin) {
      query = `
        SELECT DISTINCT pt.* FROM project_tasks pt
        INNER JOIN task_members tm ON pt.id = tm.task_id
        INNER JOIN employees e ON tm.employee_id = e.id
        WHERE LOWER(TRIM(e.emp_code)) = LOWER(TRIM($1))
          AND (pt.status IS NULL OR LOWER(pt.status) != 'completed')
        ORDER BY pt.task_name
      `;
      params.push(userEmpCode);
    }

    const result: QueryResult = await pmsPool.query(query, params);
    let tasks = result.rows as PMSTask[] || [];

    console.log(`📊 PMS tasks returned: ${tasks.length} tasks`);
    if (tasks.length > 0) {
      console.log("📋 First task sample:", JSON.stringify(tasks[0], null, 2));
    } else {
      console.log("⚠️ No tasks found in PMS database");
    }

    return tasks;
  } catch (error) {
    console.error("💥 Error connecting to PMS:", error);
    return []; // Return empty array on connection issues
  }
};

export const getTasksByProject = async (projectId: string, userDepartment?: string, userEmpCode?: string, userRole?: string): Promise<PMSTask[]> => {
  try {
    console.log("🔍 PMS getTasksByProject called with projectId:", projectId, "userEmpCode:", userEmpCode, "userRole:", userRole);
    const isAdmin = userRole === 'admin' || userEmpCode === 'E0001';

    console.log("📡 Executing PMS getTasksByProject query...");

    // projectId is the project_code, need to join with projects table
    const result: QueryResult = await pmsPool.query(
      `SELECT DISTINCT pt.* FROM project_tasks pt
       INNER JOIN projects p ON pt.project_id = p.id
       LEFT JOIN task_members tm ON pt.id = tm.task_id
       LEFT JOIN employees e ON tm.employee_id = e.id
       WHERE p.project_code = $1
         AND (pt.status IS NULL OR LOWER(pt.status) != 'completed')
         AND (LOWER(TRIM(e.emp_code)) = LOWER(TRIM($2)) OR $2 IS NULL OR $3 = TRUE)
       ORDER BY pt.task_name`,
      [projectId, userEmpCode || null, isAdmin]
    );

    let tasks = result.rows as PMSTask[] || [];
    console.log(`📊 PMS tasks returned for project ${projectId}: ${tasks.length} tasks`);
    if (tasks.length > 0) {
      console.log("📋 First task sample:", JSON.stringify(tasks[0], null, 2));
    } else {
      console.log(`⚠️ No tasks found in PMS database for project ${projectId}`);
    }

    return tasks;
  } catch (error) {
    console.error("💥 Error connecting to PMS:", error);
    return []; // Return empty array on connection issues
  }
};

export const getSubtasks = async (taskId?: string, userDepartment?: string, userEmpCode?: string): Promise<PMSSubtask[]> => {
  try {
    console.log("🔍 PMS getSubtasks called with taskId:", taskId, "userDepartment:", userDepartment, "userEmpCode:", userEmpCode);

    console.log("📡 Executing PMS getSubtasks query (fetching all subtasks)...");

    const result: QueryResult = await pmsPool.query(
      'SELECT * FROM subtasks'
    );

    let subtasks = result.rows as PMSSubtask[] || [];
    console.log(`📊 PMS subtasks returned: ${subtasks.length} subtasks`);

    if (subtasks.length > 0) {
      console.log("📋 First subtask sample:", JSON.stringify(subtasks[0], null, 2));

      // Filter by taskId and non-completed status
      if (taskId) {
        console.log(`🔍 Filtering subtasks for taskId: ${taskId}`);
        subtasks = subtasks.filter(subtask => {
          const sTaskId = String(subtask.task_id || (subtask as any).taskid || (subtask as any).task ||
            (subtask as any).parent_task_id || (subtask as any).parent_task ||
            (subtask as any).task_ref || (subtask as any).taskId).toLowerCase();
          const targetId = String(taskId).toLowerCase();

          // Match taskId AND ensure subtask is not fully completed
          const isTaskMatch = sTaskId === targetId;
          const isNotCompleted = !subtask.is_completed && (subtask.progress === undefined || subtask.progress < 100);

          // Match assignment if userEmpCode is provided
          const isAssigned = !userEmpCode || (subtask.assigned_to && String(subtask.assigned_to).toLowerCase() === String(userEmpCode).toLowerCase());

          return isTaskMatch && isNotCompleted && isAssigned;
        });
        console.log(`📊 Filtered to ${subtasks.length} active/assigned subtasks for task ${taskId}`);
      } else {
        // If no taskId, still filter by assignment and completion
        subtasks = subtasks.filter(s => {
          const isNotCompleted = !s.is_completed && (s.progress === undefined || s.progress < 100);
          const isAssigned = !userEmpCode || (s.assigned_to && String(s.assigned_to).toLowerCase() === String(userEmpCode).toLowerCase());
          return isNotCompleted && isAssigned;
        });
      }
    } else {
      console.log("⚠️ No subtasks found in PMS database");
    }

    return subtasks;
  } catch (error) {
    console.error("💥 Error connecting to PMS:", error);
    return []; // Return empty array on connection issues
  }
};

// Update a PMS task (e.g., change end_date) and return updated row
export const updateTaskInPMS = async (taskId: string, updates: { end_date?: string, status?: string }): Promise<PMSTask | null> => {
  try {
    const setParts: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (updates.end_date !== undefined) {
      setParts.push(`end_date = $${idx++}`);
      params.push(updates.end_date);
    }
    if (updates.status !== undefined) {
      setParts.push(`status = $${idx++}`);
      params.push(updates.status);
    }

    if (setParts.length === 0) return null;

    params.push(taskId);
    const query = `UPDATE project_tasks SET ${setParts.join(', ')} WHERE id = $${idx}::uuid RETURNING *`;
    const result: QueryResult = await pmsPool.query(query, params);
    if (result.rows && result.rows.length > 0) {
      return result.rows[0] as PMSTask;
    }
    return null;
  } catch (error) {
    console.error('Error updating task in PMS:', error);
    return null;
  }
};

// Update project progress percentage in PMS
export const updateProjectProgress = async (projectId: string, progress: number): Promise<boolean> => {
  try {
    console.log(`📡 Updating PMS project ${projectId} progress to ${progress}%`);
    // Supports both UUID and project_code
    const result = await pmsPool.query(
      'UPDATE projects SET progress = $1, status = $2, updated_at = NOW() WHERE id::text = $3 OR project_code = $3',
      [progress, progress === 100 ? 'Completed' : 'In Progress', projectId]
    );
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      console.log(`✅ Successfully updated PMS project ${projectId} progress`);
    } else {
      console.log(`⚠️ No rows updated for PMS project ${projectId}`);
    }
    return success;
  } catch (error) {
    console.error('💥 Error updating project progress in PMS:', error);
    return false;
  }
};
// Update a PMS subtask status
export const updateSubtaskInPMS = async (subtaskId: string, isCompleted: boolean): Promise<PMSSubtask | null> => {
  try {
    console.log(`📡 Updating PMS subtask ${subtaskId} is_completed to ${isCompleted}`);
    const result: QueryResult = await pmsPool.query(
      'UPDATE subtasks SET is_completed = $1 WHERE id = $2::uuid RETURNING *',
      [isCompleted, subtaskId]
    );
    if (result.rows && result.rows.length > 0) {
      console.log(`✅ Successfully updated PMS subtask ${subtaskId}`);
      return result.rows[0] as PMSSubtask;
    }
    console.log(`⚠️ No rows updated for PMS subtask ${subtaskId}`);
    return null;
  } catch (error) {
    console.error('💥 Error updating subtask in PMS:', error);
    return null;
  }
};

// Update a PMS subtask progress and trigger parent update
export const updateSubtaskProgress = async (subtaskId: string, progress: number): Promise<boolean> => {
  try {
    console.log(`📡 Updating PMS subtask ${subtaskId} progress to ${progress}%`);
    const result: QueryResult = await pmsPool.query(
      'UPDATE subtasks SET progress = $1, is_completed = $2, updated_at = NOW() WHERE id = $3::uuid RETURNING task_id',
      [progress, progress === 100, subtaskId]
    );
    if (result.rows && result.rows.length > 0) {
      const taskId = result.rows[0].task_id;
      // We pass 100 as progress if we know it's 100, but updateTaskProgress will recalculate anyway.
      // We don't have the date here easily, so we might need to pass it from routes.ts if we want end_date.
      await updateTaskProgress(taskId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('💥 Error updating subtask progress in PMS:', error);
    return false;
  }
};

// Recalculate task progress based on subtasks
export const updateTaskProgress = async (taskId: string, directProgress?: number, date?: string): Promise<boolean> => {
  try {
    console.log(`🔍 Recalculating progress for task ${taskId}`);
    const subtasks = await getSubtasks(taskId);

    let progress = 0;
    if (subtasks.length > 0) {
      const sum = subtasks.reduce((acc, st) => acc + (Number(st.progress) || 0), 0);
      progress = Math.round(sum / subtasks.length);
    } else if (directProgress !== undefined) {
      progress = directProgress;
    } else {
      // If no subtasks and no direct progress provided, we keep current or default to 0
      // Usually called with directProgress when subtasks don't exist
      return false;
    }

    const setParts = [`progress = $1`, `status = $2`, `updated_at = NOW()`];
    const queryParams: any[] = [progress, progress === 100 ? 'Completed' : 'In Progress'];
    
    if (progress === 100 && date) {
      setParts.push(`end_date = $${queryParams.length + 1}`);
      queryParams.push(date);
    }
    
    queryParams.push(taskId);
    const result: QueryResult = await pmsPool.query(
      `UPDATE project_tasks SET ${setParts.join(', ')} WHERE id = $${queryParams.length}::uuid RETURNING key_step_id`,
      queryParams
    );

    if (result.rows && result.rows.length > 0) {
      const keyStepId = result.rows[0].key_step_id;
      if (keyStepId) {
        await updateKeyStepProgress(keyStepId);
      } else {
        // Fallback to project update if no key step
        const taskRes = await pmsPool.query('SELECT project_id FROM project_tasks WHERE id = $1::uuid', [taskId]);
        if (taskRes.rows.length > 0) {
          await updateProjectProgressFromChildren(taskRes.rows[0].project_id);
        }
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('💥 Error updating task progress in PMS:', error);
    return false;
  }
};

// Recalculate key step progress based on tasks
export const updateKeyStepProgress = async (keyStepId: string): Promise<boolean> => {
  try {
    console.log(`🔍 Recalculating progress for key step ${keyStepId}`);
    const tasksRes = await pmsPool.query('SELECT progress FROM project_tasks WHERE key_step_id = $1::uuid', [keyStepId]);
    const tasks = tasksRes.rows;

    let progress = 0;
    if (tasks.length > 0) {
      const sum = tasks.reduce((acc, t) => acc + (Number(t.progress) || 0), 0);
      progress = Math.round(sum / tasks.length);
    }

    const result: QueryResult = await pmsPool.query(
      'UPDATE key_steps SET progress = $1, status = $2, updated_at = NOW() WHERE id = $3::uuid RETURNING project_id',
      [progress, progress === 100 ? 'Completed' : 'In Progress', keyStepId]
    );

    if (result.rows && result.rows.length > 0) {
      await updateProjectProgressFromChildren(result.rows[0].project_id);
      return true;
    }
    return false;
  } catch (error) {
    console.error('💥 Error updating key step progress in PMS:', error);
    return false;
  }
};

// Recalculate project progress based on key steps
export const updateProjectProgressFromChildren = async (projectId: string): Promise<boolean> => {
  try {
    console.log(`🔍 Recalculating progress for project ${projectId}`);
    const keyStepsRes = await pmsPool.query('SELECT progress FROM key_steps WHERE project_id = $1::uuid', [projectId]);
    const keySteps = keyStepsRes.rows;

    let progress = 0;
    if (keySteps.length > 0) {
      const sum = keySteps.reduce((acc, ks) => acc + (Number(ks.progress) || 0), 0);
      progress = Math.round(sum / keySteps.length);
    } else {
      // Fallback: if no key steps, try to average tasks directly
      const tasksRes = await pmsPool.query('SELECT progress FROM project_tasks WHERE project_id = $1::uuid', [projectId]);
      const tasks = tasksRes.rows;
      if (tasks.length > 0) {
        const sum = tasks.reduce((acc, t) => acc + (Number(t.progress) || 0), 0);
        progress = Math.round(sum / tasks.length);
      }
    }

    const result = await pmsPool.query(
      'UPDATE projects SET progress = $1, status = $2, updated_at = NOW() WHERE id::text = $3 OR project_code = $3 OR LOWER(TRIM(title)) = LOWER(TRIM($3)) RETURNING id',
      [progress, progress === 100 ? 'Completed' : 'In Progress', projectId]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('💥 Error updating project progress from children in PMS:', error);
    return false;
  }
};

// Helper to get current project progress
export const getProjectProgress = async (projectId: string): Promise<number> => {
  try {
    const res = await pmsPool.query('SELECT progress FROM projects WHERE id::text = $1 OR project_code = $1 OR LOWER(TRIM(title)) = LOWER(TRIM($1))', [projectId]);
    return res.rows[0]?.progress || 0;
  } catch (error) {
    console.error('Error fetching project progress:', error);
    return 0;
  }
};

// Insert site report into PMS database
export const saveSiteReportToPMS = async (report: any) => {
  try {
    console.log(`📡 Saving site report for ${report.projectName} to PMS internal records`);
    
    // Check if table exists, if not create it (best effort for "internal records")
    await pmsPool.query(`
      CREATE TABLE IF NOT EXISTS site_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id TEXT,
        employee_name TEXT,
        project_name TEXT,
        date TEXT,
        work_category TEXT,
        start_time TEXT,
        end_time TEXT,
        duration TEXT,
        work_done TEXT,
        issues_faced TEXT,
        materials_used TEXT,
        labor_count INTEGER,
        location_lat TEXT,
        location_lng TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const query = `
      INSERT INTO site_reports (
        employee_id, employee_name, project_name, date, work_category, 
        start_time, end_time, duration, work_done, issues_faced, 
        materials_used, labor_count, location_lat, location_lng
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const params = [
      report.employeeId, report.employeeName, report.projectName, report.date, report.workCategory,
      report.startTime, report.endTime, report.duration, report.workDone, report.issuesFaced,
      report.materialsUsed, report.laborCount, report.locationLat, report.locationLng
    ];

    const result = await pmsPool.query(query, params);
    return result.rows[0];
  } catch (error) {
    console.error('💥 Error saving site report to PMS:', error);
    return null;
  }
};

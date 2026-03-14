import "dotenv/config";
import pkg from 'pg';
const { Pool } = pkg;
import type { QueryResult } from 'pg';

// LMS Database URL from environment variables
const lmsDatabaseUrl = process.env.LMS_DATABASE_URL;

if (!lmsDatabaseUrl) {
  console.warn('⚠️ LMS_DATABASE_URL is not defined in environment variables.');
} else {
  console.log(`📡 LMS Database connection initialized (URL starts with: ${lmsDatabaseUrl.substring(0, 20)}...)`);
}

export const lmsPool = new Pool({
  connectionString: lmsDatabaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

export interface LMSHours {
  leaveHours: number;
  permissionHours: number;
  totalLMSHours: number;
  details: {
    leaves: any[];
    permissions: any[];
  };
}

/**
 * Fetches approved leave and permission hours for an employee on a specific date.
 * @param employeeCode The employee code (e.g., 'E0047')
 * @param date The date string (YYYY-MM-DD)
 */
export const getLMSHours = async (employeeCode: string, date: string): Promise<LMSHours> => {
  try {
    console.log(`🔍 Fetching LMS hours for ${employeeCode} on ${date}`);

    // 1. Fetch Approved Leaves
    // Logic: Full Day = 8h, Half Day = 4h
    const leaveQuery = `
      SELECT id, leave_type, leave_duration_type, status
      FROM leaves
      WHERE user_id = $1
        AND status = 'Approved'
        AND (
          (start_date::date <= $2::date AND end_date::date >= $2::date)
        )
    `;
    // Note: The LMS schema uses employee_name in leave_requests and has an employees table with employee_code and name.
    // Based on exploration, it's safer to join or subquery.
    
    const leaveResult: QueryResult = await lmsPool.query(leaveQuery, [employeeCode, date]);
    let leaveHours = 0;
    leaveResult.rows.forEach(row => {
      if (row.leave_duration_type === 'Full Day') leaveHours += 8;
      else if (row.leave_duration_type === 'Half Day') leaveHours += 4;
    });

    // 2. Fetch Approved Permissions
    const permissionQuery = `
      SELECT id, total_hours, status
      FROM permissions
      WHERE user_id = $1
        AND status = 'Approved'
        AND permission_date::date = $2::date
    `;
    // In exploration, permissions table has user_id which looks like employee_code (e.g., 'E0042')
    const permissionResult: QueryResult = await lmsPool.query(permissionQuery, [employeeCode, date]);
    let permissionHours = 0;
    permissionResult.rows.forEach(row => {
      permissionHours += parseFloat(row.total_hours) || 0;
    });

    const totalLMSHours = leaveHours + permissionHours;

    console.log(`✅ LMS Hours for ${employeeCode} on ${date}: Leaves=${leaveHours}h, Permissions=${permissionHours}h`);

    return {
      leaveHours,
      permissionHours,
      totalLMSHours,
      details: {
        leaves: leaveResult.rows,
        permissions: permissionResult.rows
      }
    };
  } catch (error) {
    console.error('💥 Error fetching LMS hours:', error);
    return {
      leaveHours: 0,
      permissionHours: 0,
      totalLMSHours: 0,
      details: { leaves: [], permissions: [] }
    };
  }
};

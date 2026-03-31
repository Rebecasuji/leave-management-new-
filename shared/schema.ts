import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                               Organisations                                 */
/* -------------------------------------------------------------------------- */
export const organisations = pgTable("organisations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  gstId: text("gst_id").notNull(),
  mainAddress: text("main_address").notNull(),
  branchAddress: text("branch_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrganisationSchema = createInsertSchema(organisations).omit({
  id: true,
  createdAt: true,
});
export type InsertOrganisation = z.infer<typeof insertOrganisationSchema>;
export type Organisation = typeof organisations.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                               Departments                                   */
/* -------------------------------------------------------------------------- */
export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  leader: text("leader"),
  parentDepartmentId: varchar("parent_department_id"),
  organisationId: varchar("organisation_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
});
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                   Groups                                    */
/* -------------------------------------------------------------------------- */
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentDepartment: text("parent_department").notNull(),
  groupLeader: text("group_leader"),
  organisationId: varchar("organisation_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
});
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                  Employees                                  */
/* -------------------------------------------------------------------------- */
export const employees = pgTable("employees", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"),
  department: text("department"),
  groupName: text("group_name"),
  lineManagerId: varchar("line_manager_id"),
  organisationId: varchar("organisation_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                Projects                                     */
/* -------------------------------------------------------------------------- */
export const projects = pgTable("projects", {
  project_code: text("project_code").primaryKey(),
  project_name: text("project_name").notNull(),
  description: text("description"),
  status: text("status"),
  start_date: text("start_date"),
  end_date: text("end_date"),
});

export type Project = typeof projects.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                  Tasks                                      */
/* -------------------------------------------------------------------------- */
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  project_code: text("project_code").notNull(),
  task_name: text("task_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Task = typeof tasks.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                 Subtasks                                    */
/* -------------------------------------------------------------------------- */
export const subtasks = pgTable("subtasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  task_id: varchar("task_id").notNull(),
  subtask_name: text("subtask_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Subtask = typeof subtasks.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                           Task Postponements                                */
/* -------------------------------------------------------------------------- */
export const taskPostponements = pgTable("task_postponements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  taskName: text("task_name"),
  previousDueDate: text("previous_due_date"),
  newDueDate: text("new_due_date").notNull(),
  reason: text("reason").notNull(),
  postponedBy: varchar("postponed_by"),
  postponedAt: timestamp("postponed_at").defaultNow().notNull(),
  postponeCount: integer("postpone_count").default(1),
});

export const insertTaskPostponementSchema = createInsertSchema(taskPostponements).omit({
  id: true,
  postponedAt: true,
});
export type InsertTaskPostponement = z.infer<typeof insertTaskPostponementSchema>;
export type TaskPostponement = typeof taskPostponements.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                        Task Deadline Acknowledgements                       */
/* -------------------------------------------------------------------------- */
export const taskDeadlineAcknowledgements = pgTable("task_deadline_acknowledgements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull(),
  acknowledgedBy: varchar("acknowledged_by").notNull(),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow().notNull(),
  projectCode: text("project_code"),
});

export const insertTaskDeadlineAcknowledgementSchema = createInsertSchema(taskDeadlineAcknowledgements).omit({
  id: true,
  acknowledgedAt: true,
});
export type InsertTaskDeadlineAcknowledgement = z.infer<typeof insertTaskDeadlineAcknowledgementSchema>;
export type TaskDeadlineAcknowledgement = typeof taskDeadlineAcknowledgements.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                                Time Entries                                 */
/* -------------------------------------------------------------------------- */
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  employeeCode: text("employee_code").notNull(),
  employeeName: text("employee_name").notNull(),
  date: text("date").notNull(),
  projectName: text("project_name").notNull(),
  taskDescription: text("task_description").notNull(),
  problemAndIssues: text("problem_and_issues"),
  quantify: text("quantify").notNull(),
  achievements: text("achievements"),
  scopeOfImprovements: text("scope_of_improvements"),
  toolsUsed: text("tools_used").array(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  totalHours: text("total_hours").notNull(),
  percentageComplete: integer("percentage_complete").default(0),
  pmsId: text("pms_id"),
  pmsSubtaskId: text("pms_subtask_id"),
  status: text("status").default("pending"),
  managerApproved: boolean("manager_approved").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  managerApprovedBy: varchar("manager_approved_by"),
  managerApprovedAt: timestamp("manager_approved_at"),
  rejectionReason: text("rejection_reason"),
  onHoldReason: text("on_hold_reason"),
  approvalComment: text("approval_comment"),
  keyStep: text("key_step"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*                                Discussions                                 */
/* -------------------------------------------------------------------------- */
export const discussions = pgTable("discussions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timeEntryId: varchar("time_entry_id").notNull(),
  employeeId: varchar("employee_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDiscussionSchema = createInsertSchema(discussions).omit({
  id: true,
  createdAt: true,
});

export type InsertDiscussion = z.infer<typeof insertDiscussionSchema>;
export type Discussion = typeof discussions.$inferSelect;

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  submittedAt: true,
});
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;

// Extended type for time entries with approval information
export type ExtendedTimeEntry = TimeEntry & {
  approvedBy?: string | null;
  approvedAt?: Date | null;
  managerApprovedBy?: string | null;
  managerApprovedAt?: Date | null;
  rejectionReason?: string | null;
  onHoldReason?: string | null;
  approvalComment?: string | null;
};

/* -------------------------------------------------------------------------- */
/*                                  Managers                                   */
/* -------------------------------------------------------------------------- */
export const managers = pgTable("managers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  employeeCode: text("employee_code").notNull().unique(),
  email: text("email"),
  department: text("department"),
});

export const insertManagerSchema = createInsertSchema(managers).omit({
  id: true,
});
export type InsertManager = z.infer<typeof insertManagerSchema>;
export type Manager = typeof managers.$inferSelect;

/* -------------------------------------------------------------------------- */
/*                             Dropdown Options                                 */
/* -------------------------------------------------------------------------- */
export const siteReports = pgTable("site_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  employeeName: text("employee_name").notNull(),
  projectName: text("project_name").notNull(),
  date: text("date").notNull(),
  workCategory: text("work_category").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  duration: text("duration").notNull(),
  workDone: text("work_done").notNull(),
  issuesFaced: text("issues_faced"),
  laborCount: integer("labor_count").default(0),
  laborDetails: text("labor_details"),
  materialsUsed: text("materials_used"),
  locationLat: text("location_lat"),
  locationLng: text("location_lng"),
  emailRecipients: text("email_recipients"),
  sqftCovered: text("sqft_covered"),
  laborData: jsonb("labor_data"),
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const siteReportAttachments = pgTable("site_report_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSiteReportSchema = createInsertSchema(siteReports).omit({
  id: true,
  timestamp: true,
  status: true,
});

export const insertSiteReportAttachmentSchema = createInsertSchema(siteReportAttachments).omit({
  id: true,
  createdAt: true,
});

export type SiteReport = typeof siteReports.$inferSelect;
export type InsertSiteReport = z.infer<typeof insertSiteReportSchema>;
export type SiteReportAttachment = typeof siteReportAttachments.$inferSelect;
export type InsertSiteReportAttachment = z.infer<typeof insertSiteReportAttachmentSchema>;

/* -------------------------------------------------------------------------- */
/*                               Project Points                                */
/* -------------------------------------------------------------------------- */
export const projectPoints = pgTable("project_points", {
  project_id: text("project_id").primaryKey(),
  points: integer("points").notNull().default(0),
  last_active: timestamp("last_active", { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/*                              Plan for the Day                               */
/* -------------------------------------------------------------------------- */
export const dailyPlans = pgTable("daily_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull(),
  date: text("date").notNull(), // yyyy-mm-dd
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const planTasks = pgTable("plan_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id").notNull(),
  taskId: varchar("task_id").notNull(),
  projectName: text("project_name"),
  taskName: text("task_name").notNull(),
  isDeviation: boolean("is_deviation").default(false),
  deviationReason: text("deviation_reason"),
  status: text("status").default("approved"), // deviations might need approval
});

export const insertDailyPlanSchema = createInsertSchema(dailyPlans).omit({
  id: true,
  submittedAt: true,
});

export const insertPlanTaskSchema = createInsertSchema(planTasks).omit({
  id: true,
});

export type DailyPlan = typeof dailyPlans.$inferSelect;
export type InsertDailyPlan = z.infer<typeof insertDailyPlanSchema>;
export type PlanTask = typeof planTasks.$inferSelect;
export type InsertPlanTask = z.infer<typeof insertPlanTaskSchema>;

export const DEPARTMENT_OPTIONS = [
  "Software",
  "Finance",
  "Purchase",
  "HR",
  "Admin",
  "IT Support",
  "Engineering",
  "Employee",
  "Others",
] as const;

export const PROJECT_OPTIONS = [
  "BOQ Project",
  "Timestrap Project",
  "HRMS Application",
  "PMS Application",
] as const;


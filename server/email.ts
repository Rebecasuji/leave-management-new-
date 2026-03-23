// Resend email integration for Time Strap
import { Resend } from "resend";
import "dotenv/config";
import { TimeEntry } from "@shared/schema";

/* ============================
   CONFIGURATION
============================ */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Time Strap <noreply@resend.dev>";
const SENDER_EMAILS = process.env.SENDER_EMAIL || "pushpa.p@ctint.in,sp@ctint.in";

console.log("[EMAIL CONFIG] RESEND_API_KEY:", RESEND_API_KEY ? "✓ Present" : "✗ Missing");
console.log("[EMAIL CONFIG] FROM_EMAIL:", FROM_EMAIL);
console.log("[EMAIL CONFIG] SENDER_EMAILS:", SENDER_EMAILS);

if (!RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY not found in environment variables");
}

const resend = new Resend(RESEND_API_KEY);

/* ============================
   NOTIFICATION RECIPIENTS
============================ */

// Parse sender emails from comma-separated string
const NOTIFICATION_RECIPIENTS = SENDER_EMAILS.split(",").map((email: string) => email.trim());
console.log("[EMAIL CONFIG] Recipients:", NOTIFICATION_RECIPIENTS);

/* ============================
   HELPERS / TEMPLATES
============================ */

function generateTaskTable(tasks: TimeEntry[]) {
  return `
    <table style="width:100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
      <thead>
        <tr style="background-color: #1e293b; color: #ffffff;">
          <th style="padding: 12px; border: 1px solid #334155; text-align: left;">Project</th>
          <th style="padding: 12px; border: 1px solid #334155; text-align: left;">Task Description</th>
          <th style="padding: 12px; border: 1px solid #334155; text-align: center;">Hrs</th>
          <th style="padding: 12px; border: 1px solid #334155; text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(task => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 12px; border: 1px solid #e2e8f0;">${task.projectName}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0;">${task.taskDescription}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">${task.totalHours}</td>
            <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
               <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; 
                ${task.status === 'approved' ? 'background: #dcfce7; color: #166534;' :
      task.status === 'rejected' ? 'background: #fee2e2; color: #991b1b;' :
        'background: #dbeafe; color: #1e40af;'}">
                ${(task.status || 'PENDING').toUpperCase()}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// 1. Grouped submission summary email
export async function sendTimesheetSummaryEmail(data: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  totalHours: string;
  taskHours?: string;
  lmsHours?: string;
  tasks: TimeEntry[];
  status: string; // usually 'pending'
}) {
  try {
    const { employeeName, employeeCode, date, totalHours, taskHours, lmsHours, tasks } = data;
    const taskTable = generateTaskTable(tasks);

    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_RECIPIENTS,
      subject: `Timesheet Submission Summary - ${employeeName} (${employeeCode}) - ${date}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin:0 auto;">
        <div style="background:#0f172a;padding:20px;text-align:center;">
          <h1 style="color:#3b82f6;margin:0;">Time Strap</h1>
          <p style="color:#94a3b8;">Timesheet Summary</p>
        </div>
        <div style="padding:30px;background:#f8fafc;">
          <h2 style="color:#0f172a;margin-top:0;">New Timesheet Submission</h2>
          <p><strong>Employee:</strong> ${employeeName} (${employeeCode})</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Total Hours:</strong> <span style="font-size: 1.25rem; font-weight: bold; color: #3b82f6;">${totalHours}</span></p>
          ${taskHours ? `<p style="font-size: 12px; color: #64748b; margin-bottom: 2px;">• Task Work: ${taskHours}</p>` : ''}
          ${lmsHours ? `<p style="font-size: 12px; color: #64748b; margin-top: 2px;">• LMS Approved: ${lmsHours}</p>` : ''}
          ${taskTable}
        </div>
        <div style="background:#1e293b;padding:15px;text-align:center;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">Automated email from Time Strap System</p>
        </div>
      </div>
      `
    });

    if (error) {
      console.error("[SUMMARY EMAIL ERROR]", error);
      return { success: false, error };
    }
    console.log("[SUMMARY EMAIL] sent:", result?.id);
    return { success: true, result };
  } catch (err) {
    console.error("[SUMMARY EMAIL ERROR]", err);
    return { success: false, err };
  }
}

// 2. Grouped approval/rejection email
export async function sendApprovalSummaryEmail(data: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  tasks: TimeEntry[];
  status: "manager_approved" | "approved" | "rejected";
  approverName?: string;
  rejectionReason?: string;
  recipients?: string[];
}) {
  try {
    const { employeeName, employeeCode, date, tasks, status, approverName, rejectionReason, recipients } = data;
    const taskTable = generateTaskTable(tasks);

    let statusText = '';
    let color = '';
    if (status === 'manager_approved') {
      statusText = 'Manager Approved';
      color = '#3b82f6';
    } else if (status === 'approved') {
      statusText = 'Final Approved';
      color = '#22c55e';
    } else {
      statusText = 'Rejected';
      color = '#ef4444';
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width:800px; margin:0 auto; background-color:#0f172a; color:#ffffff;">
        <div style="padding:20px;text-align:center;">
          <h1>Time Strap</h1>
          <p>Status Update: <span style="color:${color}; font-weight:bold;">${statusText}</span></p>
        </div>
        <div style="padding:30px; background:#1e293b; color:#e2e8f0;">
          <p><strong>Employee:</strong> ${employeeName} (${employeeCode})</p>
          <p><strong>Date:</strong> ${date}</p>
          ${approverName ? `<p><strong>Approved By:</strong> ${approverName}</p>` : ''}
          ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
          ${taskTable}
        </div>
        <div style="background:#0f172a;padding:15px;text-align:center;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">Automated email from Time Strap System</p>
        </div>
      </div>
    `;

    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients || NOTIFICATION_RECIPIENTS,
      subject: `Timesheet ${statusText} - ${employeeName} (${employeeCode}) - ${date}`,
      html
    });

    if (error) {
      console.error("[APPROVAL SUMMARY EMAIL ERROR]", error);
      return { success: false, error };
    }
    console.log("[APPROVAL SUMMARY EMAIL] sent:", result?.id);
    return { success: true, result };
  } catch (err) {
    console.error("[APPROVAL SUMMARY EMAIL ERROR]", err);
    return { success: false, err };
  }
}

// Generic email sender
export async function sendEmail(data: {
  to: string[];
  subject: string;
  html: string;
}) {
  try {
    const { to, subject, html } = data;
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html
    });

    if (error) {
      console.error("[EMAIL ERROR]", error);
      return { success: false, error };
    }
    console.log("[EMAIL SENT]:", result?.id);
    return { success: true, result };
  } catch (err) {
    console.error("[EMAIL ERROR]", err);            
    return { success: false, err };
  }
}

// Resend email integration for Time Strap
import { Resend } from "resend";
import "dotenv/config";
import { TimeEntry } from "@shared/schema";
import PDFDocument from "pdfkit";

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

/* ============================
   PDF GENERATION
============================ */

/**
 * Generates a neat professional PDF buffer for the site report
 */
async function generateSiteReportPDF(data: {
  employeeName: string;
  projectName: string;
  date: string;
  workCategory: string;
  startTime: string;
  endTime: string;
  duration: string;
  workDone: string;
  issuesFaced?: string;
  materialsUsed?: string;
  laborCount: number;
  laborDetails?: string;
  sqftCovered?: string;
  laborData?: { name: string; inTime: string; outTime: string }[];
  location?: { lat: string; lng: string };
  attachments?: { fileName: string; fileUrl: string; fileType?: string }[];
}): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Site Report - ${data.projectName} - ${data.date}`,
          Author: 'Time Strap PMS',
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Brand Colors
      const blue = '#3b82f6';
      const darkBlue = '#0f172a';
      const lightGray = '#f8fafc';
      const borderGray = '#e2e8f0';
      const textDark = '#1e293b';
      const textMuted = '#64748b';

      // --- HEADER ---
      doc.rect(0, 0, 595.28, 120).fill(darkBlue);
      doc.fillColor(blue).fontSize(22).text('SITE PROGRESS REPORT', 50, 45, { characterSpacing: 1 });
      doc.fillColor('#94a3b8').fontSize(12).text(`${data.projectName.toUpperCase()}  |  ${data.date}`, 50, 75);

      // --- INFO GRID ---
      let currentY = 150;
      doc.fillColor(textMuted).fontSize(9).text('REPORTED BY', 50, currentY);
      doc.fillColor(textMuted).fontSize(9).text('WORKING HOURS', 300, currentY);

      doc.fillColor(textDark).fontSize(11).text(data.employeeName, 50, currentY + 15);
      doc.fillColor(textDark).fontSize(11).text(`${data.startTime} - ${data.endTime} (${data.duration})`, 300, currentY + 15);

      currentY += 45;
      doc.fillColor(textMuted).fontSize(9).text('CATEGORY', 50, currentY);
      doc.fillColor(textMuted).fontSize(9).text('WORK OUTPUT', 300, currentY);

      doc.fillColor(textDark).fontSize(11).text(data.workCategory, 50, currentY + 15);
      doc.fillColor(textDark).fontSize(11).text(data.sqftCovered || 'N/A', 300, currentY + 15);

      // Separator
      currentY += 45;
      doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor(borderGray).stroke();
      currentY += 30;

      // --- ACCOMPLISHMENTS ---
      doc.fillColor(blue).fontSize(14).text('Daily Accomplishments', 50, currentY);
      currentY += 20;
      doc.fillColor(textDark).fontSize(10).text(data.workDone, 50, currentY, { width: 495, align: 'justify', lineGap: 2 });
      
      currentY = doc.y + 30;

      // --- LABOR LOG ---
      if (data.laborData && data.laborData.length > 0) {
        if (currentY > 700) { doc.addPage(); currentY = 50; }
        doc.fillColor('#8b5cf6').fontSize(14).text(`Labor Attendance Log (${data.laborCount} Total)`, 50, currentY);
        currentY += 25;

        // Table Header
        doc.rect(50, currentY, 495, 20).fill('#e2e8f0');
        doc.fillColor('#475569').fontSize(8).text('LABOUR NAME', 60, currentY + 6);
        doc.text('IN TIME', 300, currentY + 6);
        doc.text('OUT TIME', 450, currentY + 6);
        currentY += 20;

        doc.fillColor(textDark).fontSize(9);
        for (const l of data.laborData) {
          if (currentY > 750) { doc.addPage(); currentY = 50; }
          doc.text(l.name || 'Anonymous', 60, currentY + 6);
          doc.text(l.inTime || '--:--', 300, currentY + 6);
          doc.text(l.outTime || '--:--', 450, currentY + 6);
          doc.moveTo(50, currentY + 20).lineTo(545, currentY + 20).strokeColor('#f1f5f9').stroke();
          currentY += 20;
        }
        currentY += 10;
      } else if (data.laborDetails) {
         if (currentY > 700) { doc.addPage(); currentY = 50; }
         doc.fillColor('#8b5cf6').fontSize(14).text('Labor Details', 50, currentY);
         currentY += 20;
         doc.fillColor(textDark).fontSize(10).text(data.laborDetails, 50, currentY, { width: 495 });
         currentY = doc.y + 30;
      }

      // --- MATERIALS ---
      if (data.materialsUsed) {
        if (currentY > 700) { doc.addPage(); currentY = 50; }
        doc.fillColor('#10b981').fontSize(14).text('Materials Consumed', 50, currentY);
        currentY += 20;
        doc.fillColor(textDark).fontSize(10).text(data.materialsUsed, 50, currentY, { width: 495 });
        currentY = doc.y + 30;
      }

      // --- CHALLENGES ---
      if (data.issuesFaced) {
        if (currentY > 700) { doc.addPage(); currentY = 50; }
        doc.fillColor('#ef4444').fontSize(14).text('Challenges & Bottlenecks', 50, currentY);
        currentY += 20;
        doc.rect(50, currentY, 495, 40).fill('#fff1f2').stroke('#fecaca');
        doc.fillColor('#991b1b').fontSize(10).text(data.issuesFaced, 60, currentY + 10, { width: 475 });
        currentY = doc.y + 30;
      }

      // --- PHOTOS ---
      const images = data.attachments?.filter(a => a.fileType?.startsWith('image/') || a.fileUrl?.startsWith('data:image/')) || [];
      if (images.length > 0) {
        doc.addPage();
        doc.fillColor(darkBlue).fontSize(18).text('SITE EVIDENCE PHOTOS', 50, 50);
        currentY = 100;

        for (const img of images) {
          try {
            if (currentY > 550) { doc.addPage(); currentY = 50; }
            
            let imgBuffer: Buffer;
            if (img.fileUrl.startsWith('data:')) {
              const base64Data = img.fileUrl.split(';base64,').pop()!;
              imgBuffer = Buffer.from(base64Data, 'base64');
            } else {
              // Internal public URL or external URL
              const response = await fetch(img.fileUrl);
              const arrayBuffer = await response.arrayBuffer();
              imgBuffer = Buffer.from(arrayBuffer);
            }

            // Draw image with max width/height to fit
            doc.image(imgBuffer, 50, currentY, { width: 495, height: 250, fit: [495, 250] });
            currentY += 260;
            doc.fillColor(textMuted).fontSize(8).text(img.fileName, 50, currentY);
            currentY += 30;
          } catch (e) {
            console.error('Failed to add image to PDF:', img.fileName, e);
            doc.fillColor('#ef4444').fontSize(8).text(`[Failed to load image: ${img.fileName}]`, 50, currentY);
            currentY += 20;
          }
        }
      }

      // Footer
      doc.fontSize(8).fillColor(textMuted).text('Automated professional site report via Time Strap PMS.', 50, 780, { align: 'center' });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Helper to get a human-readable address from lat/lng
 */
async function getAddressFromCoords(lat?: string, lng?: string): Promise<string | undefined> {
  if (!lat || !lng) return undefined;
  try {
    // Using Nominatim (OpenStreetMap) for basic reverse geocoding
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'TimeStrap-PMS-Reporter' }
    });
    const data = await response.json();
    if (data && data.display_name) {
      // Return a shortened version (e.g., City, Suburb)
      const parts = data.display_name.split(',');
      if (parts.length > 3) {
        return `${parts[0].trim()}, ${parts[1].trim()}, ${parts[2].trim()}`;
      }
      return data.display_name;
    }
  } catch (err) {
    console.error('[GEOCODE] Failed to resolve address:', err);
  }
  return undefined;
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

// 3. Site Report Email
export async function sendSiteReportEmail(data: {
  employeeName: string;
  projectName: string;
  date: string;
  workCategory: string;
  startTime: string;
  endTime: string;
  duration: string;
  workDone: string;
  issuesFaced?: string;
  materialsUsed?: string;
  laborCount: number;
  laborDetails?: string;
  sqftCovered?: string;
  laborData?: { name: string; inTime: string; outTime: string }[];
  location?: { lat: string; lng: string };
  attachments?: { fileName: string; fileUrl: string; fileType?: string }[];
  recipients: string[];
}) {
  try {
    const { 
      employeeName, projectName, date, workCategory, 
      startTime, endTime, duration, workDone, 
      issuesFaced, materialsUsed, laborCount, laborDetails,
      sqftCovered, laborData,
      location, attachments, recipients 
    } = data;

    // Separate images from other files
    const imageAttachments = attachments?.filter(a => a.fileType?.startsWith('image/') || a.fileUrl?.startsWith('data:image/')) || [];
    const otherAttachments = attachments?.filter(a => !(a.fileType?.startsWith('image/') || a.fileUrl?.startsWith('data:image/'))) || [];

    const locationName = await getAddressFromCoords(location?.lat, location?.lng);

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; color: #334155; line-height: 1.6;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="color: #3b82f6; margin: 0; font-size: 28px; letter-spacing: -0.5px;">Site Progress Report</h1>
          <p style="color: #94a3b8; margin: 10px 0 0 0; font-size: 16px;">${projectName} | ${date}</p>
        </div>

        <!-- Meta Grid -->
        <div style="padding: 30px; background: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; width: 50%;">
                <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block;">Reported By</span>
                <span style="font-size: 15px; color: #0f172a; font-weight: 500;">${employeeName}</span>
              </td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; width: 50%;">
                <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block;">Working Hours</span>
                <span style="font-size: 15px; color: #0f172a; font-weight: 500;">
                  ${startTime} - ${endTime} (${duration})
                  ${locationName ? `<br /><span style="font-size: 11px; color: #3b82f6; font-weight: 600;">📍 ${locationName}</span>` : ''}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block;">Category</span>
                <span style="font-size: 15px; color: #0f172a; font-weight: 500;">${workCategory}</span>
              </td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block;">Work Output</span>
                <span style="font-size: 15px; color: #0f172a; font-weight: 500;">${sqftCovered || 'N/A'}</span>
              </td>
            </tr>
          </table>

          <!-- Main Content -->
          <div style="margin-top: 30px;">
            <h3 style="color: #0f172a; font-size: 18px; margin-bottom: 12px; border-left: 4px solid #3b82f6; padding-left: 12px;">Daily Accomplishments</h3>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; color: #334155; font-size: 15px; white-space: pre-wrap;">${workDone}</div>
          </div>

          ${(laborData && laborData.length > 0) ? `
          <div style="margin-top: 25px;">
            <h3 style="color: #0f172a; font-size: 18px; margin-bottom: 12px; border-left: 4px solid #8b5cf6; padding-left: 12px;">Individual Attendance Log (${laborCount} Total)</h3>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 12px; overflow: hidden;">
              <thead>
                <tr style="background: #e2e8f0; text-align: left;">
                  <th style="padding: 12px; font-size: 12px; color: #475569; text-transform: uppercase;">Labour Name</th>
                  <th style="padding: 12px; font-size: 12px; color: #475569; text-transform: uppercase;">In Time</th>
                  <th style="padding: 12px; font-size: 12px; color: #475569; text-transform: uppercase;">Out Time</th>
                </tr>
              </thead>
              <tbody>
                ${laborData.map(l => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px; font-size: 14px; color: #1e293b;">${l.name || 'Anonymous'}</td>
                    <td style="padding: 12px; font-size: 14px; color: #475569;">${l.inTime || '--:--'}</td>
                    <td style="padding: 12px; font-size: 14px; color: #475569;">${l.outTime || '--:--'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : laborDetails ? `
          <div style="margin-top: 25px;">
            <h3 style="color: #0f172a; font-size: 18px; margin-bottom: 12px; border-left: 4px solid #8b5cf6; padding-left: 12px;">Labor Breakdown</h3>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; color: #334155; font-size: 15px; white-space: pre-wrap;">${laborDetails}</div>
          </div>
          ` : ''}

          ${materialsUsed ? `
          <div style="margin-top: 25px;">
            <h3 style="color: #0f172a; font-size: 18px; margin-bottom: 12px; border-left: 4px solid #10b981; padding-left: 12px;">Materials Consumed</h3>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; color: #334155; font-size: 15px; white-space: pre-wrap;">${materialsUsed}</div>
          </div>
          ` : ''}

          ${issuesFaced ? `
          <div style="margin-top: 25px;">
            <h3 style="color: #0f172a; font-size: 18px; margin-bottom: 12px; border-left: 4px solid #ef4444; padding-left: 12px;">Challenges & Bottlenecks</h3>
            <div style="background: #fff1f2; padding: 20px; border-radius: 12px; color: #991b1b; font-size: 15px; white-space: pre-wrap;">${issuesFaced}</div>
          </div>
          ` : ''}

          ${imageAttachments.length > 0 ? `
          <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 25px;">
            <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 15px; border-left: 4px solid #6366f1; padding-left: 12px;">📷 Site Evidence Photos (${imageAttachments.length})</h3>
            ${imageAttachments.map(a => `
              <div style="margin-bottom: 16px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <img src="${a.fileUrl}" alt="${a.fileName}" style="width: 100%; max-width: 700px; height: auto; display: block;" />
                <div style="padding: 8px 12px; background: #f8fafc; font-size: 12px; color: #64748b;">${a.fileName}</div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          ${otherAttachments.length > 0 ? `
          <div style="margin-top: 20px;">
            <h3 style="color: #0f172a; font-size: 16px; margin-bottom: 15px;">📎 Other Documents</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${otherAttachments.map(a => `
                <span style="display: inline-block; padding: 8px 16px; background: #e2e8f0; color: #475569; border-radius: 8px; font-size: 13px; font-weight: 500; margin: 4px;">
                  📄 ${a.fileName}
                </span>
              `).join('')}
            </div>
          </div>
          ` : ''}

          ${locationName ? `
          <div style="margin-top: 30px; padding: 15px; background: #f1f5f9; border-radius: 12px; text-align: center;">
            <span style="font-size: 12px; color: #64748b;">📍 GPS Verified Location: <strong>${locationName}</strong></span>
          </div>
          ` : location ? `
          <div style="margin-top: 30px; padding: 15px; background: #f1f5f9; border-radius: 12px; text-align: center;">
            <span style="font-size: 12px; color: #64748b;">📍 GPS Verified Location: <strong>${location.lat}, ${location.lng}</strong></span>
          </div>
          ` : ''}
        </div>

        <!-- Footer -->
        <div style="padding: 30px; text-align: center; border-radius: 0 0 16px 16px;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">Automated professional site report via Time Strap PMS.</p>
        </div>
      </div>
    `;

    const pdfBuffer = await generateSiteReportPDF({ ...data, location: location ? { lat: location.lat, lng: location.lng } : undefined });
    const fileName = `Site_Report_${projectName.replace(/\s+/g, '_')}_${date}.pdf`;

    // Process image attachments to be sent as actual files
    const imageFiles = imageAttachments.map(a => ({
      filename: a.fileName,
      content: a.fileUrl.startsWith('data:') 
        ? Buffer.from(a.fileUrl.split(';base64,').pop()!, 'base64')
        : undefined,
      path: a.fileUrl.startsWith('http') ? a.fileUrl : undefined
    }));

    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients.length > 0 ? recipients : NOTIFICATION_RECIPIENTS,
      subject: `[Site Report] ${projectName} - ${date} - ${workCategory}`,
      html,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
        },
        ...imageFiles.filter(f => f.content || f.path) // only include if we have content or path
      ]
    });

    if (error) {
      console.error("[SITE REPORT EMAIL ERROR]", error);
      return { success: false, error };
    }
    console.log("[SITE REPORT EMAIL] sent:", result?.id);
    return { success: true, result };
  } catch (err) {
    console.error("[SITE REPORT EMAIL ERROR]", err);
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

export async function sendDeviationNotificationEmail(data: {
  employeeName: string;
  employeeCode: string;
  taskName: string;
  projectName: string;
  reason: string;
}) {
  const { employeeName, employeeCode, taskName, projectName, reason } = data;
  const date = new Date().toLocaleDateString('en-IN');
  const subject = `[Deviation Approval Required] ${employeeName} (${employeeCode}) - ${projectName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #d97706; border-bottom: 2px solid #fcd34d; padding-bottom: 10px;">⚠️ Deviation Approval Request</h2>
      <p><strong>Employee:</strong> ${employeeName} (${employeeCode})</p>
      <p><strong>Date:</strong> ${date}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0;"><strong>Task:</strong> ${taskName}</p>
        <p style="margin: 5px 0 0 0;"><strong>Project:</strong> ${projectName}</p>
        <p style="margin: 15px 0 0 0;"><strong>Reason for Deviation:</strong></p>
        <p style="background: white; padding: 10px; border: 1px solid #fde68a; border-radius: 4px; font-style: italic;">"${reason}"</p>
      </div>
      <p style="margin-top: 20px;">This task was not part of the initial "Plan for the Day" and requires your approval.</p>
      <div style="margin-top: 30px; text-align: center;">
        <a href="${process.env.APP_URL || 'http://localhost:5000'}/approvals"
           style="background-color: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
           Review in Approval Page →
        </a>
      </div>
    </div>
  `;

  console.log("[DEVIATION EMAIL] Sending to:", NOTIFICATION_RECIPIENTS);
  return await sendEmail({ to: NOTIFICATION_RECIPIENTS, subject, html });
}

export async function sendDailyPlanSubmittedEmail(data: {
  employeeName: string;
  employeeCode: string;
  selectedTasks: { task_name: string; projectName?: string; start_date?: string; end_date?: string; progress?: number; isOverdue?: boolean }[];
  unselectedTasks: { taskName: string; reason: string; newDueDate: string; start_date?: string; end_date?: string; progress?: number; isOverdue?: boolean }[];
}) {
  const { employeeName, employeeCode, selectedTasks, unselectedTasks } = data;
  const date = new Date().toLocaleDateString('en-IN');
  const subject = `[Daily Plan Submitted] ${employeeName} (${employeeCode}) - ${date}`;

  const overdueSelectedTasks = selectedTasks.filter(t => t.isOverdue);
  const onTrackSelectedTasks = selectedTasks.filter(t => !t.isOverdue);
  const overdueUnselectedTasks = unselectedTasks.filter(t => t.isOverdue);
  const onTrackUnselectedTasks = unselectedTasks.filter(t => !t.isOverdue);

  const generateTaskRow = (t: any, isUnselected: boolean = false) => {
    const progress = t.progress !== undefined ? `${t.progress}%` : '0%';
    const progressColor = t.progress === 100 ? '#16a34a' : t.progress && t.progress > 0 ? '#2563eb' : '#64748b';
    
    if (isUnselected) {
      return `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:500;">${t.taskName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-style:italic;color:#64748b;">${t.reason}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:${progressColor};text-align:center;">${progress}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:12px;text-align:center;">
          <div><span style="color:#94a3b8">Start:</span> ${t.start_date ? new Date(t.start_date).toLocaleDateString('en-IN') : '—'}</div>
          <div><span style="color:#94a3b8">End:</span> ${t.end_date ? new Date(t.end_date).toLocaleDateString('en-IN') : '—'}</div>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:bold;color:#d97706;">${new Date(t.newDueDate).toLocaleDateString('en-IN')}</td>
      </tr>`;
    }

    return `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:500;">${t.task_name}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;color:#475569;">${t.projectName || '—'}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-weight:bold;color:${progressColor};text-align:center;">${progress}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-size:12px;text-align:center;">
        <div><span style="color:#94a3b8">Start:</span> ${t.start_date ? new Date(t.start_date).toLocaleDateString('en-IN') : '—'}</div>
        <div><span style="color:#94a3b8">End:</span> ${t.end_date ? new Date(t.end_date).toLocaleDateString('en-IN') : '—'}</div>
      </td>
    </tr>`;
  };

  const renderTable = (rows: string, isUnselected: boolean = false, isOverdue: boolean = false) => {
    if (!rows) return '';
    return `
      <div style="margin-top: 15px; border-radius: 8px; overflow: hidden; border: 1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'};">
        <div style="background: ${isOverdue ? '#fef2f2' : (isUnselected ? '#fffbeb' : '#f0fdf4')}; padding: 10px 15px; border-bottom: 1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}; font-weight: bold; color: ${isOverdue ? '#dc2626' : (isUnselected ? '#d97706' : '#16a34a')}; display: flex; align-items: center; justify-content: space-between;">
          ${isOverdue ? '⚠️ OVERDUE TASKS' : '✅ ON-TRACK TASKS'}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#ffffff;">
          <thead>
            <tr style="background:#f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding:12px 8px;text-align:left;color:#475569;font-weight:600;">Task</th>
              ${isUnselected 
                ? '<th style="padding:12px 8px;text-align:left;color:#475569;font-weight:600;">Reason</th>'
                : '<th style="padding:12px 8px;text-align:left;color:#475569;font-weight:600;">Project</th>'}
              <th style="padding:12px 8px;text-align:center;color:#475569;font-weight:600;">Progress</th>
              <th style="padding:12px 8px;text-align:center;color:#475569;font-weight:600;">Timeline</th>
              ${isUnselected ? '<th style="padding:12px 8px;text-align:center;color:#475569;font-weight:600;">Next Target</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  };

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fafafa;">
      <div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; border-left: 4px solid #2563eb;">
        <h2 style="color: #1e3a8a; margin-top: 0; margin-bottom: 8px;">📋 Daily Plan Submitted</h2>
        <p style="margin: 4px 0; color: #475569;"><strong>Employee:</strong> <span style="color:#0f172a;">${employeeName} (${employeeCode})</span></p>
        <p style="margin: 4px 0; color: #475569;"><strong>Date:</strong> <span style="color:#0f172a;">${date}</span></p>
      </div>

      <h3 style="color: #0f172a; margin-top: 24px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">🎯 Selected Tasks (${selectedTasks.length})</h3>
      ${selectedTasks.length === 0 ? '<p style="color:#64748b; font-style:italic; text-align:center; padding: 15px;">No tasks selected.</p>' : ''}
      ${renderTable(overdueSelectedTasks.map(t => generateTaskRow(t)).join(''), false, true)}
      ${renderTable(onTrackSelectedTasks.map(t => generateTaskRow(t)).join(''), false, false)}

      ${unselectedTasks.length > 0 ? `
      <h3 style="color: #0f172a; margin-top: 32px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">⏭️ Tasks Not Selected (${unselectedTasks.length}) — Requires Review</h3>
      ${renderTable(overdueUnselectedTasks.map(t => generateTaskRow(t, true)).join(''), true, true)}
      ${renderTable(onTrackUnselectedTasks.map(t => generateTaskRow(t, true)).join(''), true, false)}
      ` : ''}
      
      <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        Auto-generated by Time Strap
      </div>
    </div>
  `;

  console.log("[DAILY PLAN EMAIL] Sending to:", NOTIFICATION_RECIPIENTS);
  return await sendEmail({ to: NOTIFICATION_RECIPIENTS, subject, html });
}

export async function sendDailyPlanReminderEmail(data: { recipients: string[] }) {
  const { recipients } = data;
  const subject = `📢 Morning Reminder: Submit your Plan for the Day`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 2px solid #3b82f6; border-radius: 12px; background-color: #f8fafc;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1e3a8a; margin: 0; font-size: 24px;">Plan for the Day Reminder</h1>
        <p style="color: #64748b; font-size: 16px;">Don't forget to capture your objectives!</p>
      </div>
      
      <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
        <p style="font-size: 18px; color: #0f172a; font-weight: bold; margin-bottom: 16px;">
          The Daily Plan portal will close at <span style="color: #ef4444;">12:00 PM</span> sharp today.
        </p>
        <p style="color: #475569; line-height: 1.5; margin-bottom: 24px;">
          Starting your day with a clear plan helps you stay focused and ensures your tasks are tracked accurately for approval.
        </p>
      </div>
      
      <div style="margin-top: 24px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p>This is an automated reminder from Time Strap. Good luck with your tasks today!</p>
      </div>
    </div>
  `;

  console.log(`[ALERT EMAIL] Sending reminder to ${recipients.length} employees`);
  return await sendEmail({ to: recipients, subject, html });
}

export async function sendTaskPostponementEmail(data: {
  recipients: string[];
  taskName: string;
  postponedByDetails: string;
  reason: string;
  newDueDate: string;
  previousDueDate: string;
}) {
  const { recipients, taskName, postponedByDetails, reason, newDueDate, previousDueDate } = data;
  const subject = `Task Deadline Extended: ${taskName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #2563eb; border-bottom: 2px solid #bfdbfe; padding-bottom: 12px; margin-top: 0;">📅 Task Deadline Extended</h2>
      <p style="color: #334155; font-size: 15px; margin-bottom: 20px;">A task deadline has been postponed. Below are the details of the extension:</p>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; width: 35%; color: #475569;">Task</td>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; color: #0f172a; font-weight: 500;">${taskName}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; color: #475569;">Postponed By</td>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; color: #0f172a;">${postponedByDetails}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; color: #475569;">Reason</td>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-style: italic; color: #ea580c; background-color: #fff7ed;">"${reason}"</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; color: #475569;">New Due Date</td>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: bold; color: #16a34a; background-color: #f0fdf4;">${newDueDate}</td>
          </tr>
          <tr>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; color: #475569;">Previous Due Date</td>
            <td style="padding: 14px 16px; border: 1px solid #e2e8f0; color: #64748b; text-decoration: line-through;">${previousDueDate}</td>
          </tr>
        </tbody>
      </table>
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 13px;">
        <p>This is an automated notification from the Time Strap System.</p>
      </div>
    </div>
  `;

  console.log(`[POSTPONEMENT EMAIL] Sending to: ${recipients.length} recipients`);
  return await sendEmail({ to: recipients, subject, html });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// POST /api/v1/contacts/import - Import contacts from CSV
export async function POST(request: NextRequest) {
  try {
    const result = await requireAuth(request);
    if ("error" in result) {
      return result.error;
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return errorResponse(400, "No file provided");
    }

    if (!file.name.endsWith(".csv")) {
      return errorResponse(400, "File must be a CSV file");
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(400, "File size must not exceed 5MB");
    }

    const content = await file.text();
    const rows = parseCSV(content);

    if (rows.length === 0) {
      return errorResponse(400, "CSV file is empty");
    }

    // Parse header to find column indices
    const header = rows[0];
    const orgIndex = findColumnIndex(header, ["organisation", "organization", "org", "company", "name"]);
    const descIndex = findColumnIndex(header, ["description", "desc", "notes", "note"]);

    if (orgIndex === -1) {
      return errorResponse(
        400,
        "CSV must have an 'Organisation' column (or similar: organization, org, company, name)"
      );
    }

    const importResult: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    // Process data rows
    const contactsToCreate: { organisation: string; description: string | null }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Skip empty rows (rows where all fields are empty)
      if (row.every((field) => field.trim() === "")) {
        continue;
      }

      const organisation = row[orgIndex]?.trim() || "";
      const description = descIndex !== -1 ? row[descIndex]?.trim() || null : null;

      if (!organisation) {
        importResult.skipped++;
        importResult.errors.push(`Row ${i + 1}: Organisation is empty`);
        continue;
      }

      if (organisation.length > 255) {
        importResult.skipped++;
        importResult.errors.push(
          `Row ${i + 1}: Organisation "${organisation.substring(0, 30)}..." exceeds 255 characters`
        );
        continue;
      }

      contactsToCreate.push({
        organisation,
        description: description || null,
      });
    }

    // Batch create contacts
    if (contactsToCreate.length > 0) {
      await prisma.contact.createMany({
        data: contactsToCreate.map((contact) => ({
          ...contact,
          ownerId: result.user.id,
        })),
      });
      importResult.imported = contactsToCreate.length;
    }

    return successResponse(importResult, 201);
  } catch (error) {
    console.error("Import contacts error:", error);
    return errorResponse(500, "Internal server error");
  }
}

function findColumnIndex(header: string[], possibleNames: string[]): number {
  const normalizedHeader = header.map((h) => h.toLowerCase().trim());
  for (const name of possibleNames) {
    const index = normalizedHeader.indexOf(name);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      }
      if (char === "\r") {
        // Skip carriage return
        i++;
        continue;
      }
      if (char === "\n") {
        // End of row
        currentRow.push(currentField);
        if (currentRow.some((field) => field.trim() !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }
      currentField += char;
      i++;
    }
  }

  // Handle last row (if no trailing newline)
  currentRow.push(currentField);
  if (currentRow.some((field) => field.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

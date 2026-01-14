import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-utils";

// GET /api/v1/contacts/export - Export contacts as CSV
export async function GET(request: NextRequest) {
  try {
    const result = await requireAuth(request);
    if ("error" in result) {
      return result.error;
    }

    // Superusers see all contacts, regular users see only their own
    const whereClause = result.user.isSuperuser
      ? {}
      : { ownerId: result.user.id };

    const contacts = await prisma.contact.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        owner: {
          select: {
            email: true,
            fullName: true,
          },
        },
      },
    });

    // Build CSV content
    const headers = ["Organisation", "Description", "Owner Name", "Owner Email", "Created At"];
    const rows: string[][] = contacts.map((contact: typeof contacts[number]) => [
      escapeCsvField(contact.organisation),
      escapeCsvField(contact.description || ""),
      escapeCsvField(contact.owner.fullName || ""),
      escapeCsvField(contact.owner.email),
      escapeCsvField(contact.createdAt.toISOString()),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) => row.join(",")),
    ].join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="contacts.csv"',
      },
    });
  } catch (error) {
    console.error("Export contacts error:", error);
    return NextResponse.json(
      { detail: "Internal server error" },
      { status: 500 }
    );
  }
}

function escapeCsvField(field: string): string {
  // If field contains comma, newline, or double quote, wrap in quotes and escape quotes
  if (field.includes(",") || field.includes("\n") || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

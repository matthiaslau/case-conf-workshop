import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, errorResponse, successResponse, parseQueryParams } from "@/lib/api-utils";

// GET /api/v1/contacts - List contacts
export async function GET(request: NextRequest) {
  try {
    const result = await requireAuth(request);
    if ("error" in result) {
      return result.error;
    }

    const { skip, limit } = parseQueryParams(request);
    const searchParams = new URL(request.url).searchParams;
    const search = searchParams.get("q") || "";

    // Superusers see all contacts, regular users see only their own
    const ownerFilter = result.user.isSuperuser ? {} : { ownerId: result.user.id };

    // Apply search filter if provided
    const whereClause = search
      ? {
          ...ownerFilter,
          OR: [
            { organisation: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : ownerFilter;

    const [contacts, count] = await Promise.all([
      prisma.contact.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      }),
      prisma.contact.count({ where: whereClause }),
    ]);

    return successResponse({
      data: contacts,
      count,
    });
  } catch (error) {
    console.error("List contacts error:", error);
    return errorResponse(500, "Internal server error");
  }
}

// POST /api/v1/contacts - Create a new contact
export async function POST(request: NextRequest) {
  try {
    const result = await requireAuth(request);
    if ("error" in result) {
      return result.error;
    }

    const body = await request.json();
    const { organisation, description } = body;

    if (!organisation) {
      return errorResponse(400, "Organisation is required");
    }

    if (organisation.length > 255) {
      return errorResponse(400, "Organisation must be at most 255 characters");
    }

    const contact = await prisma.contact.create({
      data: {
        organisation,
        description: description || null,
        ownerId: result.user.id,
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    return successResponse(contact, 201);
  } catch (error) {
    console.error("Create contact error:", error);
    return errorResponse(500, "Internal server error");
  }
}

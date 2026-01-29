import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// Mock the prisma client
vi.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// Mock the auth
vi.mock("@/lib/api-utils", () => ({
  requireAuth: vi.fn(),
  errorResponse: vi.fn((status: number, message: string) => {
    return new Response(JSON.stringify({ detail: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }),
  successResponse: vi.fn((data: unknown, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-utils";

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  fullName: "Test User",
  isActive: true,
  isSuperuser: false,
};

function createMockRequest(csvContent: string, filename = "contacts.csv"): NextRequest {
  const file = new File([csvContent], filename, { type: "text/csv" });
  const formData = new FormData();
  formData.append("file", file);

  return new NextRequest("http://localhost/api/v1/contacts/import", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/v1/contacts/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ user: mockUser });
  });

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(requireAuth).mockResolvedValue({
        error: new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }),
      });

      const request = createMockRequest("Organisation\nTest Org");
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe("File validation", () => {
    it("returns 400 when no file is provided", async () => {
      const formData = new FormData();
      const request = new NextRequest("http://localhost/api/v1/contacts/import", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.detail).toBe("No file provided");
    });

    it("returns 400 when file is not a CSV", async () => {
      const file = new File(["test content"], "contacts.txt", { type: "text/plain" });
      const formData = new FormData();
      formData.append("file", file);

      const request = new NextRequest("http://localhost/api/v1/contacts/import", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.detail).toBe("File must be a CSV file");
    });

    it("returns 400 when CSV is empty", async () => {
      const request = createMockRequest("");
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.detail).toBe("CSV file is empty");
    });

    it("returns 400 when file exceeds 5MB", async () => {
      // Create a file that's just over 5MB
      const largeContent = "Organisation\n" + "A".repeat(5 * 1024 * 1024);
      const file = new File([largeContent], "large.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);

      const request = new NextRequest("http://localhost/api/v1/contacts/import", {
        method: "POST",
        body: formData,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.detail).toBe("File size must not exceed 5MB");
    });

    it("returns 400 when CSV has no Organisation column", async () => {
      const request = createMockRequest("Email,Phone\njohn@test.com,555-1234");
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.detail).toContain("Organisation");
    });
  });

  describe("Column detection", () => {
    it("accepts 'Organisation' as column name", async () => {
      const csv = "Organisation,Description\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(1);
    });

    it("accepts 'organization' (American spelling) as column name", async () => {
      const csv = "organization,Description\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(1);
    });

    it("accepts 'org' as column name", async () => {
      const csv = "org,notes\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it("accepts 'company' as column name", async () => {
      const csv = "company,notes\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it("accepts 'name' as column name", async () => {
      const csv = "name,notes\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it("accepts 'description' as column name for description field", async () => {
      const csv = "organisation,description\nAcme Corp,A company";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: "Acme Corp",
            description: "A company",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("accepts 'notes' as column name for description field", async () => {
      const csv = "organisation,notes\nAcme Corp,Some notes";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: "Acme Corp",
            description: "Some notes",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("handles case-insensitive column names", async () => {
      const csv = "ORGANISATION,DESCRIPTION\nAcme Corp,A company";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(1);
    });
  });

  describe("CSV parsing", () => {
    it("imports multiple rows", async () => {
      const csv = "Organisation,Description\nCompany A,Desc A\nCompany B,Desc B\nCompany C,Desc C";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(3);
    });

    it("handles quoted fields with commas", async () => {
      const csv = 'Organisation,Description\n"Acme, Inc.",A company with comma';
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: "Acme, Inc.",
            description: "A company with comma",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("handles quoted fields with escaped quotes", async () => {
      const csv = 'Organisation,Description\n"Acme ""The Best"" Corp",A company';
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: 'Acme "The Best" Corp',
            description: "A company",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("handles quoted fields with newlines", async () => {
      const csv = 'Organisation,Description\n"Acme Corp","A company\nwith newline"';
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: "Acme Corp",
            description: "A company\nwith newline",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("trims whitespace from field values", async () => {
      const csv = "Organisation,Description\n  Acme Corp  ,  A company  ";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          {
            organisation: "Acme Corp",
            description: "A company",
            ownerId: "user-123",
          },
        ],
      });
    });

    it("handles Windows-style line endings (CRLF)", async () => {
      const csv = "Organisation,Description\r\nCompany A,Desc A\r\nCompany B,Desc B";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(2);
    });

    it("skips empty lines", async () => {
      const csv = "Organisation,Description\n\nCompany A,Desc A\n\nCompany B,Desc B\n";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(2);
    });

    it("handles CSV without description column", async () => {
      const csv = "Organisation\nAcme Corp\nOther Corp";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [
          { organisation: "Acme Corp", description: null, ownerId: "user-123" },
          { organisation: "Other Corp", description: null, ownerId: "user-123" },
        ],
      });
    });

    it("handles empty description as null", async () => {
      const csv = "Organisation,Description\nAcme Corp,";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: [{ organisation: "Acme Corp", description: null, ownerId: "user-123" }],
      });
    });
  });

  describe("Validation", () => {
    it("skips rows with empty organisation", async () => {
      const csv = "Organisation,Description\n,Empty org\nAcme Corp,Valid";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(1);
      expect(body.errors).toContain("Row 2: Organisation is empty");
    });

    it("skips rows with organisation exceeding 255 characters", async () => {
      const longOrg = "A".repeat(256);
      const csv = `Organisation,Description\n${longOrg},Too long\nAcme Corp,Valid`;
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(1);
      expect(body.errors[0]).toContain("exceeds 255 characters");
    });

    it("accepts organisation with exactly 255 characters", async () => {
      const maxOrg = "A".repeat(255);
      const csv = `Organisation,Description\n${maxOrg},Max length`;
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(body.imported).toBe(1);
      expect(body.skipped).toBe(0);
    });
  });

  describe("Import result", () => {
    it("returns correct import statistics", async () => {
      const csv = "Organisation,Description\nCompany A,Desc A\n,Empty\nCompany B,Desc B";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(2);
      expect(body.skipped).toBe(1);
      expect(body.errors.length).toBe(1);
    });

    it("returns empty result for header-only CSV", async () => {
      const csv = "Organisation,Description";
      const request = createMockRequest(csv);

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.imported).toBe(0);
      expect(body.skipped).toBe(0);
    });

    it("assigns ownerId to current user", async () => {
      const csv = "Organisation\nAcme Corp";
      const request = createMockRequest(csv);

      await POST(request);

      expect(prisma.contact.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ ownerId: "user-123" }),
        ]),
      });
    });
  });
});

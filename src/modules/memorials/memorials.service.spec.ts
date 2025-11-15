import { Test, TestingModule } from "@nestjs/testing";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { MemorialsService } from "./memorials.service";
import { FeedsService } from "../feeds/feeds.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { Visibility, MemorialStatus } from "@prisma/client";

describe("MemorialsService", () => {
  let service: MemorialsService;
  let prismaService: PrismaService;
  let feedsService: FeedsService;
  let auditService: AuditService;

  const mockUserId = "user-123";
  const mockMemorialId = "memorial-123";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorialsService,
        {
          provide: PrismaService,
          useValue: {
            memorial: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: FeedsService,
          useValue: {
            ensureMemorialFeed: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MemorialsService>(MemorialsService);
    prismaService = module.get<PrismaService>(PrismaService);
    feedsService = module.get<FeedsService>(FeedsService);
    auditService = module.get<AuditService>(AuditService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("should create a memorial successfully", async () => {
      const createDto = {
        slug: "john-doe-memorial",
        displayName: "John Doe",
        visibility: Visibility.PUBLIC,
        shortId: "abc123",
      };

      const mockMemorial = {
        id: mockMemorialId,
        ...createDto,
        salutation: null,
        yearOfBirth: null,
        yearOfPassing: null,
        location: null,
        bioSummary: null,
        tags: [],
        status: MemorialStatus.ACTIVE,
        verificationStatus: "UNVERIFIED",
        ownerUserId: mockUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      jest.spyOn(prismaService.memorial, "findUnique").mockResolvedValue(null);
      jest
        .spyOn(prismaService.memorial, "create")
        .mockResolvedValue(mockMemorial as never);
      jest
        .spyOn(feedsService, "ensureMemorialFeed")
        .mockResolvedValue({ id: "feed-123" } as never);
      jest.spyOn(auditService, "record").mockResolvedValue(undefined);

      const result = await service.create(createDto, mockUserId);

      expect(result).toBeDefined();
      expect(result.slug).toBe("john-doe-memorial");
      expect(result.displayName).toBe("John Doe");
      expect(prismaService.memorial.create).toHaveBeenCalled();
    });

    it("should throw ConflictException if slug already exists", async () => {
      const createDto = {
        slug: "existing-slug",
        displayName: "John Doe",
        shortId: "abc123", // Added shortId to match the updated createDto structure
      };

      jest
        .spyOn(prismaService.memorial, "findUnique")
        .mockResolvedValue({ id: "existing-id" } as never);

      await expect(service.create(createDto, mockUserId)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should reject if tags exceed limit", async () => {
      const createDto = {
        slug: "john-doe",
        displayName: "John Doe",
        shortId: "abc123",
        tags: Array(26).fill("tag"),
      };

      await expect(service.create(createDto, mockUserId)).rejects.toThrow();
    });
  });

  describe("getById", () => {
    it("should return a memorial when authorized", async () => {
      const mockMemorial = {
        id: mockMemorialId,
        slug: "john-doe",
        displayName: "John Doe",
        visibility: Visibility.PUBLIC,
        ownerUserId: mockUserId,
        feeds: [],
        salutation: null,
        dateOfBirth: null,
        dateOfPassing: null,
        location: null,
        bioSummary: null,
        tags: [],
        status: MemorialStatus.ACTIVE,
        verificationStatus: "UNVERIFIED",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      jest
        .spyOn(prismaService.memorial, "findUnique")
        .mockResolvedValue(mockMemorial as never);

      const result = await service.getById(mockMemorialId, mockUserId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockMemorialId);
    });

    it("should throw NotFoundException if memorial not found", async () => {
      jest.spyOn(prismaService.memorial, "findUnique").mockResolvedValue(null);

      await expect(service.getById(mockMemorialId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should deny access to private memorial for non-owner", async () => {
      const mockMemorial = {
        id: mockMemorialId,
        displayName: "John Doe",
        visibility: Visibility.PRIVATE,
        ownerUserId: "other-user",
        feeds: [],
        slug: "john-doe",
        salutation: null,
        dateOfBirth: null,
        dateOfPassing: null,
        location: null,
        bioSummary: null,
        tags: [],
        status: MemorialStatus.ACTIVE,
        verificationStatus: "UNVERIFIED",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      jest
        .spyOn(prismaService.memorial, "findUnique")
        .mockResolvedValue(mockMemorial as never);

      await expect(service.getById(mockMemorialId, mockUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("toggleArchive", () => {
    it("should archive a memorial when owner requests", async () => {
      const mockMemorial = {
        id: mockMemorialId,
        slug: "john-doe",
        displayName: "John Doe",
        status: MemorialStatus.ACTIVE,
        ownerUserId: mockUserId,
        feeds: [],
        visibility: Visibility.PUBLIC,
        salutation: null,
        dateOfBirth: null,
        dateOfPassing: null,
        location: null,
        bioSummary: null,
        tags: [],
        verificationStatus: "UNVERIFIED",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      const archivedMemorial = {
        ...mockMemorial,
        status: MemorialStatus.ARCHIVED,
        archivedAt: new Date(),
      };

      jest
        .spyOn(prismaService.memorial, "findUnique")
        .mockResolvedValue(mockMemorial as never);
      jest
        .spyOn(prismaService.memorial, "update")
        .mockResolvedValue(archivedMemorial as never);
      jest.spyOn(auditService, "record").mockResolvedValue(undefined);

      const result = await service.toggleArchive(mockMemorialId, mockUserId);

      expect(result).toBeDefined();
      expect(prismaService.memorial.update).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if not owner", async () => {
      const mockMemorial = {
        id: mockMemorialId,
        ownerUserId: "other-user",
        feeds: [],
      };

      jest
        .spyOn(prismaService.memorial, "findUnique")
        .mockResolvedValue(mockMemorial as never);

      await expect(
        service.toggleArchive(mockMemorialId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

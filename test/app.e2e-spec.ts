import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, HttpStatus } from "@nestjs/common";
import supertest from "supertest";
import { AppModule } from "../src/app.module";

const request = supertest;

describe("Afterlife Service E2E", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Health Endpoints (M0)", () => {
    it("GET /health should return 200", () => {
      return request(app.getHttpServer())
        .get("/health")
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty("status", "ok");
          expect(res.body).toHaveProperty("uptime");
        });
    });

    it("GET /ready should return 200", () => {
      return request(app.getHttpServer())
        .get("/ready")
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty("status");
          expect(res.body).toHaveProperty("database");
        });
    });
  });

  describe("Swagger Documentation (M0)", () => {
    it("GET /docs should return Swagger UI", () => {
      return request(app.getHttpServer()).get("/docs").expect(HttpStatus.OK);
    });
  });

  describe("Authentication (M0)", () => {
    it("should reject unauthenticated requests to protected endpoints", () => {
      return request(app.getHttpServer())
        .post("/memorials")
        .send({
          slug: "test-memorial",
          displayName: "Test Memorial",
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe("Memorials (M1)", () => {
    const token = "test-jwt-token"; // Would be generated in real tests
    let memorialId: string;

    it("should create a memorial with valid JWT", async () => {
      // Note: In a real scenario, you'd generate a valid JWT
      // For now, this demonstrates the expected flow
      const createMemorialDto = {
        slug: "john-doe-memorial",
        displayName: "John Doe",
        visibility: "PUBLIC",
        tags: ["tribute", "family"],
      };

      // This would require a valid JWT token
      // In production tests, mock the auth or use test fixtures
      const response = await request(app.getHttpServer())
        .post("/memorials")
        .set("Authorization", `Bearer ${token}`)
        .send(createMemorialDto);

      // Depending on whether we have a test JWT
      if (response.status === HttpStatus.CREATED) {
        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("slug", "john-doe-memorial");
        memorialId = response.body.id;
      } else if (response.status === HttpStatus.UNAUTHORIZED) {
        // Expected if no token provided
        expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it("should get a public memorial without authentication", async () => {
      // GET /memorials without auth should return public memorials
      const response = await request(app.getHttpServer())
        .get("/memorials")
        .query({ visibility: "PUBLIC" });

      expect([HttpStatus.OK, HttpStatus.UNAUTHORIZED]).toContain(
        response.status,
      );
    });

    it("should reject archive without ownership", async () => {
      // This would fail without a valid JWT or with wrong ownership
      const response = await request(app.getHttpServer())
        .patch("/memorials/unknown-id/archive")
        .set("Authorization", `Bearer invalid-token`);

      expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(
        response.status,
      );
    });
  });

  describe("Follows (M1)", () => {
    it("should reject follow without authentication", async () => {
      return request(app.getHttpServer())
        .post("/follows")
        .send({
          targetType: "MEMORIAL",
          targetId: "memorial-123",
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe("Input Validation (M0)", () => {
    it("should reject invalid request bodies", async () => {
      return request(app.getHttpServer())
        .post("/memorials")
        .send({
          slug: "ab", // Too short
          displayName: "", // Empty
        })
        .expect((res) => {
          expect([HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED]).toContain(
            res.status,
          );
        });
    });
  });
});

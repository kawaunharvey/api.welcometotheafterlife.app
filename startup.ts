// Pull in api keys from crownworks and adds them to this database.
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const CROWNWORKS_API_URL =
  process.env.CROWNWORKS_API_URL ||
  "https://crownworks.thehereafter.tech/api/v1/services/theafterlifeapp";

const SERVICE_APP_URL =
  process.env.SERVICE_APP_URL || "https://api.welcometotheafterlife.app";

const SERVICE_KEY = process.env.CROWNWORKS_SERVICE_KEY;

async function main() {
  const SERVICE_SECRET = crypto.randomBytes(32).toString("hex");

  if (!SERVICE_KEY) {
    throw new Error("CROWNWORKS_SERVICE_KEY is not set in environment");
  }
  const response = await fetch(`${CROWNWORKS_API_URL}/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      healthCheckUrl: `${SERVICE_APP_URL}/health`,
      serviceUrl: SERVICE_APP_URL,
      serviceSecret: SERVICE_SECRET,
      serviceKey: SERVICE_KEY,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Error setting up service in Crownworks:", data);
    throw new Error(
      `Failed to set up service in Crownworks: ${response.statusText}`,
    );
  }

  const prisma = new PrismaClient();

  console.log("Seeding Crownworks API key into database...");
  console.log(data);
}

main();

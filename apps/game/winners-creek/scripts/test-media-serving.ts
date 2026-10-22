import { GET as getMediaRoute } from "../app/api/media/[...key]/route";
import { NextRequest } from "next/server";
import { db } from "../lib/db/client";
import { users, recordingAssets } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { putObject } from "../lib/storage";
import fs from "node:fs";
import path from "node:path";

async function verifyMediaServing() {
  console.log("==========================================");
  console.log("VERIFYING /api/media/[...key] SERVING");
  console.log("==========================================");

  // 1. Get student user
  const student = await db.query.users.findFirst({
    where: eq(users.email, "student@winnerscreek.dev"),
  });
  if (!student) throw new Error("Student user not found");

  // 2. Read real rendered slide PNG
  const pngPath = path.resolve(process.cwd(), "test-assets", "slide-1.png");
  const pngBytes = fs.readFileSync(pngPath);

  // 3. Put in storage
  const storageKey = await putObject(new Uint8Array(pngBytes), { prefix: "slide-images", ext: "png" });
  console.log("✓ Stored test slide PNG with key:", storageKey);

  // 4. Insert recordingAsset entry in DB
  const [asset] = await db
    .insert(recordingAssets)
    .values({
      ownerUserId: student.id,
      kind: "slide_image",
      storageKey,
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
    })
    .returning();

  console.log("✓ Created recordingAssets record:", asset.id);

  // 5. Create authorized session request
  const { config } = await import("../lib/config");
  const secret = new TextEncoder().encode(config.SESSION_SECRET);
  const token = await new SignJWT({
    userId: student.id,
    email: student.email,
    role: student.role,
    name: student.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const req = new NextRequest(`http://localhost:3000/api/media/${storageKey}`, {
    headers: {
      cookie: `wc_session=${token}`,
    },
  });

  // Call the Next.js catch-all GET route
  const params = Promise.resolve({ key: storageKey.split("/") });
  const res = await getMediaRoute(req, { params });

  console.log(`✓ Media endpoint response status: ${res.status}`);
  console.log(`✓ Media endpoint Content-Type: ${res.headers.get("content-type")}`);
  console.log(`✓ Media endpoint Content-Length: ${res.headers.get("content-length")}`);

  if (res.status !== 200) {
    throw new Error(`Expected HTTP 200, got ${res.status}`);
  }
  if (res.headers.get("content-type") !== "image/png") {
    throw new Error(`Expected image/png, got ${res.headers.get("content-type")}`);
  }
  if (Number(res.headers.get("content-length")) !== pngBytes.byteLength) {
    throw new Error(`Expected content length ${pngBytes.byteLength}, got ${res.headers.get("content-length")}`);
  }

  const servedArrayBuffer = await res.arrayBuffer();
  console.log(`✓ Successfully received ${servedArrayBuffer.byteLength} bytes of pure PNG image data!`);

  console.log("==========================================");
  console.log("ALL MEDIA SERVING CHECKS PASSED!");
  console.log("==========================================");
}

verifyMediaServing().catch((e) => {
  console.error("Media verification failed:", e);
  process.exit(1);
});

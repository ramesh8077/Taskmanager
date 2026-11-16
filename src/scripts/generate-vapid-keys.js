const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("Create the project .env file before generating push keys.");
  }

  const existing = fs.readFileSync(envPath, "utf8");
  const requiredNames = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
  if (requiredNames.every((name) => new RegExp(`^${name}=`, "m").test(existing))) {
    console.log("VAPID settings already exist in .env; no keys were changed.");
    return;
  }

  const webpush = await import("web-push");
  const keys = webpush.generateVAPIDKeys();
  const preservedLines = existing.split(/\r?\n/).filter((line) =>
    !requiredNames.some((name) => line.startsWith(`${name}=`))
  );
  while (preservedLines.length && preservedLines[preservedLines.length - 1] === "") preservedLines.pop();
  preservedLines.push(
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    "VAPID_SUBJECT=mailto:your-notifications-contact@example.com",
  );
  fs.writeFileSync(envPath, `${preservedLines.join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  console.log("Generated VAPID keys in the ignored .env file. Keep VAPID_PRIVATE_KEY secret.");
  console.log("Use the same three VAPID values in the Vercel project environment settings.");
}

main().catch((error) => {
  console.error("Unable to generate VAPID keys:", error.message);
  process.exitCode = 1;
});

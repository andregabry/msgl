import { sendTemporaryPasswordEmail } from "../src/lib/email/mailer";

async function main() {
  console.log("Sending test email to andre.gabry@enging.pt...");
  const res = await sendTemporaryPasswordEmail({
    to: "andre.gabry@enging.pt",
    displayName: "André Gabry",
    tempPassword: "T7m9K2w8",
    loginUrl: "https://googlechat.enging.pt",
  });
  console.log("SUCCESS! Message ID:", res.messageId);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});

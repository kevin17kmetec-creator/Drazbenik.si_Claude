const fs = require('fs');
const content = fs.readFileSync('src/server/app.ts', 'utf8');

const newRoute = `
app.post("/api/auth/send-email-change", async (req, res) => {
  try {
    const { email, newEmail, displayName } = req.body;
    if (!email || !newEmail) return res.status(400).json({ error: "Manjkajo podatki" });

    const actionUrl = await adminAuth.generateVerifyAndChangeEmailLink(email, newEmail, {
      url: \`\${process.env.APP_URL || 'https://drazba.si'}/?tab=settings\`
    });

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const htmlContent = await render(React.createElement(AuthEmailTemplate, {
        type: 'verify_email',
        actionUrl,
        recipientName: displayName || newEmail.split('@')[0],
      }));

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Drazba.si <obvestila@drazba.si>',
        to: newEmail,
        subject: 'Potrdite spremembo e-poštnega naslova - dražbenik.si',
        html: htmlContent,
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("send-email-change error:", err);
    res.status(500).json({ error: err.message });
  }
});
`;

const updatedContent = content.replace(
  '// AUTH EMAILS',
  '// AUTH EMAILS\n' + newRoute
);

fs.writeFileSync('src/server/app.ts', updatedContent);

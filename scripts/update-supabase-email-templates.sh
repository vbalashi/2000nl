#!/bin/bash
# Supabase Email Template Branding Script
# Updates email templates via Management API

set -e

# Configuration
PROJECT_REF="lliwdcpuuzjmxyzrjtoz"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN environment variable not set"
  echo "Get your token from: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

# Branded email template for Magic Link / OTP
read -r -d '' EMAIL_TEMPLATE << 'EOF' || true
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jouw inlogcode voor 2000.nl</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 16px 0;
    }
    .text {
      font-size: 16px;
      color: #475569;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .code-box {
      background: #f1f5f9;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .code {
      font-size: 32px;
      font-weight: 900;
      color: #667eea;
      letter-spacing: 4px;
      font-family: 'Courier New', monospace;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
    }
    .footer {
      background: #f8fafc;
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #64748b;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">2000.nl</div>
    </div>
    <div class="content">
      <h1 class="title">Welkom terug! 👋</h1>
      <p class="text">
        Gebruik de onderstaande code om in te loggen bij 2000.nl en door te gaan met het leren van de 2000 meest voorkomende Nederlandse woorden.
      </p>
      <div class="code-box">
        <div class="code">{{ .Token }}</div>
      </div>
      <p class="text" style="text-align: center;">
        Of klik op de knop hieronder om automatisch in te loggen:
      </p>
      <div style="text-align: center;">
        <a href="{{ .ConfirmationURL }}" class="button">Inloggen bij 2000.nl</a>
      </div>
      <p class="text" style="font-size: 14px; color: #94a3b8; margin-top: 32px;">
        Deze code is 1 uur geldig. Als je deze inlogpoging niet hebt aangevraagd, kun je deze e-mail veilig negeren.
      </p>
    </div>
    <div class="footer">
      <p>
        <strong>2000.nl</strong> — Leer de 2000 meest voorkomende Nederlandse woorden<br>
        <a href="https://2000.dilum.io">2000.dilum.io</a>
      </p>
    </div>
  </div>
</body>
</html>
EOF

# Update the Magic Link email template
echo "Updating Magic Link email template..."
curl -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"mailer_subjects_magic_link\": \"Jouw inlogcode voor 2000.nl\",
    \"mailer_templates_magic_link_content\": $(echo "$EMAIL_TEMPLATE" | jq -Rs .)
  }"

echo ""
echo "✅ Email template updated successfully!"
echo ""
echo "Next steps:"
echo "1. Go to Supabase Dashboard → Authentication → URL Configuration"
echo "2. Set Site URL to: https://2000.dilum.io"
echo "3. Add Redirect URL: https://2000.dilum.io/auth/callback"
echo "4. Test the new OTP flow!"

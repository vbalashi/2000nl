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

# Shared branded email styles and layout.
read -r -d '' BASE_TEMPLATE_START << 'EOF_TEMPLATE' || true
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ .Title }}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8f9ff;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    .header {
      background: #2e2bee;
      padding: 40px 20px;
      text-align: center;
    }
    .logo {
      font-size: 32px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
      text-transform: lowercase;
    }
    .content {
      padding: 40px 30px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px 0;
    }
    .text {
      font-size: 16px;
      color: #475569;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .code-box {
      background: #eef2ff;
      border: 2px dashed #c7d2fe;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .code {
      font-size: 32px;
      font-weight: 900;
      color: #2e2bee;
      letter-spacing: 4px;
      font-family: 'Courier New', monospace;
    }
    .button {
      display: inline-block;
      background: #2e2bee;
      color: #ffffff;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      margin: 24px 0;
    }
    .footer {
      background: #f8f9ff;
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #64748b;
    }
    .footer a {
      color: #2e2bee;
      text-decoration: none;
    }
    .note {
      font-size: 14px;
      color: #94a3b8;
      margin-top: 28px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">2000.nl</div>
    </div>
    <div class="content">
      {{ .Body }}
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
EOF_TEMPLATE

# Confirmation (registration) template.
read -r -d '' CONFIRMATION_BODY << 'EOF_TEMPLATE' || true
<h1 class="title">Welkom bij 2000.nl!</h1>
<p class="text">
  Bevestig je e-mailadres om je account te activeren en te starten met het leren van de 2000 meest voorkomende Nederlandse woorden.
</p>
<div style="text-align: center;">
  <a href="{{ .ConfirmationURL }}" class="button">E-mailadres bevestigen</a>
</div>
<p class="note">
  Werkt de knop niet? Kopieer dan deze link in je browser:<br>
  {{ .ConfirmationURL }}
</p>
EOF_TEMPLATE

# Password recovery template.
read -r -d '' RECOVERY_BODY << 'EOF_TEMPLATE' || true
<h1 class="title">Wachtwoord herstellen</h1>
<p class="text">
  We hebben een verzoek ontvangen om je wachtwoord te herstellen. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.
</p>
<div style="text-align: center;">
  <a href="{{ .ConfirmationURL }}" class="button">Wachtwoord resetten</a>
</div>
<p class="note">
  Heb je dit niet aangevraagd? Dan kun je deze e-mail veilig negeren.
</p>
EOF_TEMPLATE

# Magic Link / OTP template.
read -r -d '' MAGIC_LINK_BODY << 'EOF_TEMPLATE' || true
<h1 class="title">Je inlogcode voor 2000.nl</h1>
<p class="text">
  Gebruik de onderstaande code om in te loggen. Je kunt ook de knop gebruiken om direct verder te gaan.
</p>
<div class="code-box">
  <div class="code">{{ .Token }}</div>
</div>
<div style="text-align: center;">
  <a href="{{ .ConfirmationURL }}" class="button">Inloggen bij 2000.nl</a>
</div>
<p class="note">
  Deze code is 1 uur geldig. Als je deze inlogpoging niet hebt aangevraagd, kun je deze e-mail veilig negeren.
</p>
EOF_TEMPLATE

# Compose full templates with embedded bodies.
CONFIRMATION_TEMPLATE=$(printf "%s" "$BASE_TEMPLATE_START" | \
  sed "s/{{ \\.Title }}/Bevestig je e-mailadres voor 2000.nl/g" | \
  sed "s~{{ \\.Body }}~$CONFIRMATION_BODY~g")

RECOVERY_TEMPLATE=$(printf "%s" "$BASE_TEMPLATE_START" | \
  sed "s/{{ \\.Title }}/Herstel je wachtwoord voor 2000.nl/g" | \
  sed "s~{{ \\.Body }}~$RECOVERY_BODY~g")

MAGIC_LINK_TEMPLATE=$(printf "%s" "$BASE_TEMPLATE_START" | \
  sed "s/{{ \\.Title }}/Je inlogcode voor 2000.nl/g" | \
  sed "s~{{ \\.Body }}~$MAGIC_LINK_BODY~g")

# Update auth email templates via the Management API.
echo "Updating confirmation, recovery, and magic link email templates..."
curl -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"mailer_subjects_confirmation\": \"Bevestig je e-mailadres voor 2000.nl\",
    \"mailer_templates_confirmation_content\": $(echo "$CONFIRMATION_TEMPLATE" | jq -Rs .),
    \"mailer_subjects_recovery\": \"Herstel je wachtwoord voor 2000.nl\",
    \"mailer_templates_recovery_content\": $(echo "$RECOVERY_TEMPLATE" | jq -Rs .),
    \"mailer_subjects_magic_link\": \"Je inlogcode voor 2000.nl\",
    \"mailer_templates_magic_link_content\": $(echo "$MAGIC_LINK_TEMPLATE" | jq -Rs .)
  }"

echo ""
echo "✅ Email templates updated successfully!"
echo ""
echo "Next steps:"
echo "1. Go to Supabase Dashboard → Authentication → Email Templates"
echo "2. Verify confirmation, recovery, and magic link templates"
echo "3. Test the OTP flow (magic link template provides the code)"

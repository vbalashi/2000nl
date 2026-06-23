# Telegram Deployment Notifications - Setup Report

**Date:** 2026-01-26
**Scope:** GitHub Actions `deploy-nuc` workflow notifications

## Goal
Send deploy start/success/failure notifications to a private Telegram group (or DM).

## Prerequisites
- A Telegram bot token from BotFather.
- A target chat (DM, private group, or channel) where notifications should be delivered.

## Step-by-step setup
1. **Create bot**
   - In Telegram, open `@BotFather`.
   - Run `/newbot`, choose a name and username.
   - Copy the bot token (keep it private).

2. **Choose target chat**
   - **Private group:** create a group, add the bot.
   - **DM:** start a direct chat with the bot and press **Start**.
   - **Channel:** add the bot as an admin if you want it to post there.

3. **Capture chat ID**
   - Send a message in the target chat (or mention the bot in a group).
   - Call Telegram Bot API:
     ```bash
     curl -s "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
     ```
   - Find the `chat.id` in the response:
     - Example group chat ID: `-5197887560`
     - Group IDs are usually negative; supergroups often start with `-100`.

4. **Store secrets in GitHub**
   - GitHub → Repo → **Settings** → **Secrets and variables** → **Actions**
   - Add repository secrets:
     - `TELEGRAM_BOT_TOKEN` = bot token
     - `TELEGRAM_CHAT_ID` = chat ID from step 3

5. **Verify workflow configuration**
   - Ensure `.github/workflows/deploy-nuc.yml` has:
     - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in env
     - `DEPLOY_SERVER_NAME` set correctly (optional)

6. **Trigger a test deploy**
   - Push a commit to `main`, or:
     ```bash
     git commit --allow-empty -m "trigger deploy"
     git push origin main
     ```

## Notification schema (current workflow)
- **Start:** 🚀 Deployment started
  - Version, commit, server name
- **Success:** ✅ Deployment succeeded
  - Version, commit, server name, duration
- **Failure:** ❌ Deployment failed
  - Version, commit, server name, duration, error details

## Privacy notes
- Notifications are **only** visible in the configured chat.
- Private group = visible only to group members.
- DM = visible only to you.

## Current Shared Deployment Bot

Use the same deployment-status bot and chat for 2000NL and AudioFilms deploy
notifications.

Bot:

```text
Telegram username: @status_2000nl_bot
Display name:      2000nl_status
Bot token source:  1Password item telegram, field @status_2000nl_bot
Secret name:       TELEGRAM_BOT_TOKEN
```

Do not write the bot token into repository files, runbooks, shell history, or
plain `.env` files. Store it as a GitHub Actions secret in each repository that
sends deploy notifications.

Current chat IDs seen by the bot:

```text
Current supergroup: -1003979211146  2000nl status
Old/basic group:    -5197887560     2000nl status
```

Use the supergroup ID `-1003979211146` for new deployment notifications,
including AudioFilms. Store it as the GitHub Actions secret
`TELEGRAM_CHAT_ID`.

Current repositories using this notification pair:

```text
vbalashi/2000nl      TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
vbalashi/audiofilms  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

To recover the chat ID later, send any message in the target Telegram chat
after the bot has been added, then run:

```bash
bot_token="$(op read 'op://Private/telegram/4oqpbvfxsspffjdbs2nqoouszy')"
curl -fsS "https://api.telegram.org/bot${bot_token}/getUpdates" |
  jq '[.result[] |
    (.message.chat? // .channel_post.chat? // .my_chat_member.chat? // .chat_member.chat?) |
    select(. != null) |
    {id, type, title, username}] | unique'
```

For this bot, `getMe` should return username `status_2000nl_bot`.

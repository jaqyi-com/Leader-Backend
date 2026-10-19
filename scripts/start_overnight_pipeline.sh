#!/bin/bash
# Autonomous Shell Supervisor for Overnight Verification Pipeline

echo "🛡️ Starting Autonomous Overnight Verification Supervisor..."
CD_PATH="/Volumes/akshat/LeadGenerator"
cd "$CD_PATH" || exit 1

export PATH=$PATH:/opt/homebrew/bin:/usr/local/bin

until node scripts/verify_all_database_emails.js >> logs/email_verification.log 2>&1; do
    echo "⚠️ Process exited with code $?. Auto-restarting in 2 seconds..." >> logs/email_verification.log
    sleep 2
done

echo "✅ Email Verification Pipeline Completed Successfully." >> logs/email_verification.log

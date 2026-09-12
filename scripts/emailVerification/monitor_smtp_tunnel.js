"use strict";
require("dotenv").config({ path: "/Volumes/akshat/LeadGenerator/.env" });
process.env.USE_SOCKS5_PROXY = "true";
process.env.ENABLE_SMTP_PROBES = "true";

const { probeSmtpMailbox } = require("../../src/services/emailVerification/smtpVerifier");

async function checkPort25Status() {
  console.log("=========================================================================");
  console.log("       🔍 LIVE MONITOR: SOCKS5 PROXY & AWS PORT 25 CONNECTIVITY         ");
  console.log("=========================================================================");
  console.log(`[Proxy] Target: 127.0.0.1:1080 (AWS EC2 Tunnel: 13.61.176.192)`);
  console.log(`[Time]  ${new Date().toLocaleTimeString()}\n`);

  // Test against Google MX
  console.log("Testing connection to Google MX (aspmx.l.google.com:25)...");
  const test1 = await probeSmtpMailbox("aspmx.l.google.com", "verify-test@gmail.com", 6000);
  
  if (test1.result === "accepted" || test1.code === 250 || (test1.banner && test1.banner.includes("Google"))) {
    console.log(`\n🎉 AWS PORT 25 IS ACTIVE & UNBLOCKED!`);
    console.log(`  • Server Banner: ${test1.banner}`);
    console.log(`  • Response Code: ${test1.code}`);
    console.log(`  • Message      : ${test1.message}`);
    console.log(`\n✅ You are ready to run full Bouncer-grade verification locally!`);
  } else if (test1.message && test1.message.includes("blocked")) {
    console.log(`\n⏳ Status: AWS Port 25 request is currently PENDING review with AWS.`);
    console.log(`  • Error Details: ${test1.message}`);
    console.log(`  • Note: AWS usually takes a short time to process the request.`);
  } else {
    console.log(`\n⏳ Status Update:`);
    console.log(`  • Result : ${test1.result}`);
    console.log(`  • Message: ${test1.message}`);
  }
  console.log("\n=========================================================================");
}

checkPort25Status();

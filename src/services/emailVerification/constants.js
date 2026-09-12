"use strict";

/**
 * Top ~50 common email domains used for Levenshtein typo-correction (Stage 1).
 */
const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
  "yahoo.ca", "yahoo.com.au", "hotmail.com", "hotmail.co.uk", "hotmail.fr",
  "hotmail.es", "hotmail.it", "outlook.com", "outlook.co.uk", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com",
  "proton.me", "zoho.com", "mail.com", "gmx.com", "gmx.de", "web.de",
  "yandex.com", "yandex.ru", "fastmail.com", "tutanota.com", "comcast.net",
  "sbcglobal.net", "verizon.net", "att.net", "bellsouth.net", "cox.net",
  "charter.net", "shaw.ca", "rogers.com", "btinternet.com", "virginmedia.com",
  "rediffmail.com", "qq.com", "163.com", "126.com", "sina.com", "naver.com",
  "daum.net", "hanmail.net"
];

/**
 * Static role-address local-part prefixes (Stage 5).
 * Config-driven list of department/generic inboxes.
 */
const ROLE_PREFIXES = [
  "admin", "administrator", "info", "information", "support", "help",
  "sales", "contact", "contactus", "billing", "invoices", "accounting",
  "finance", "noreply", "no-reply", "donotreply", "jobs", "careers",
  "hr", "recruiting", "marketing", "media", "press", "team", "office",
  "legal", "compliance", "security", "privacy", "webmaster", "postmaster",
  "hostmaster", "root", "abuse", "dev", "tech", "engineering", "ops",
  "operations", "general", "inquiries", "enquiry", "enquiries", "service",
  "customercare", "hello", "hi", "mail", "desk", "feedback"
];

/**
 * Major freemail & consumer ESP domains.
 * SMTP probes to these providers often return 250 OK regardless of real mailbox existence
 * or aggressively rate limit / drop port 25 connections.
 */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.ca",
  "yahoo.co.in", "yahoo.com.au", "hotmail.com", "hotmail.co.uk", "hotmail.fr",
  "hotmail.es", "hotmail.it", "outlook.com", "outlook.co.uk", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "mail.com",
  "zoho.com", "protonmail.com", "proton.me", "yandex.com", "yandex.ru",
  "gmx.com", "gmx.de", "web.de", "fastmail.com", "comcast.net", "sbcglobal.net",
  "verizon.net", "att.net", "bellsouth.net", "cox.net", "charter.net"
]);

/**
 * Built-in fallback disposable domains list (Stage 4)
 * (Guarantees immediate zero-config protection before initial GitHub sync)
 */
const SEED_DISPOSABLE_DOMAINS = [
  "mailinator.com", "guerrillamail.com", "guerrillamailblock.com", "sharklasers.com",
  "grr.la", "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.net", "guerrillamail.org", "tempmail.com", "temp-mail.org",
  "temp-mail.io", "throwaway.email", "yopmail.com", "yopmail.fr", "yopmail.net",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "trashmail.com",
  "trashmail.net", "maildrop.cc", "discard.email", "dispostable.com",
  "fakeinbox.com", "getairmail.com", "generator.email", "nada.ltd",
  "crazymailing.com", "mohmal.com", "mytemp.email", "burners.io", "burnermail.io",
  "burnerapp.com", "tempail.com", "inboxkitten.com", "fakemailgenerator.com",
  "emailondeck.com", "getnada.com", "tempr.email", "discardmail.com",
  "spambog.com", "spambog.de", "spambog.ru", "armyspy.com", "cuvox.de",
  "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com",
  "rhyta.com", "superrito.com", "teleworm.us", "trashmail.de", "trashmail.me",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org", "trashinbox.com",
  "anonymouse.org", "boun.cr", "bouncr.com", "chacuo.net", "despam.it",
  "dontsendmespam.de", "drdrb.net", "drdrb.com", "emailias.com", "filzmail.com",
  "harakirimail.com", "jetable.org", "kasmail.com", "mailbidon.com", "mailcatch.com",
  "mailcure.com", "mailexpire.com", "mailforspam.com", "mailimate.com", "mailmoat.com",
  "mailnesia.com", "mailnull.com", "mailshell.com", "mailslurp.com", "mailtemp.net",
  "mailtothis.com", "mailzilla.com", "mintemail.com", "mycleaninbox.com", "mytempmail.com",
  "nobulk.com", "nomail.xl.cx", "nospam.ze.tc", "nospam4.us", "nospamfor.us",
  "notsharingmy.info", "nowhere.org", "oneoffmail.com", "pookmail.com", "privacy.net",
  "proxymail.eu", "punkass.com", "safersignup.com", "safetymail.info", "safetypost.de",
  "sandviks.com", "sharklasers.com", "shortmail.net", "skeefmail.com", "slopsbox.com",
  "sneakemail.com", "sofort-mail.de", "sogetthis.com", "spam.la", "spam4.me",
  "spamavert.com", "spambob.com", "spambob.net", "spambob.org", "spambox.us",
  "spamcan.org", "spamcon.org", "spamcorptastic.com", "spamcowboy.com", "spamday.com",
  "spamex.com", "spamfree24.org", "spamgourmet.com", "spamhole.com", "spaminator.de",
  "spaml.com", "spaml.de", "spamspot.com", "spamstack.net", "spamtrap.ro",
  "superstachel.de", "suremail.info", "tafmail.com", "tempemail.net", "tempemail.co.za",
  "tempinbox.com", "tempm.com", "temporaryemail.net", "temporaryinbox.com",
  "thankyou2010.com", "trash-mail.at", "trash-mail.com", "trash-me.com", "trashymail.com",
  "tyldd.com", "uggsrock.com", "upgradedmail.com", "validmail.net", "venompen.com",
  "veryrealemail.com", "vidalia.org", "viewimy.com", "whyspam.me", "willhackforfood.biz",
  "wuzup.net", "wuzupmail.net", "ypmail.webcam", "zippymail.info", "zoemail.org"
];

const VERIFICATION_STATES = {
  DELIVERABLE: "deliverable",
  UNDELIVERABLE: "undeliverable",
  RISKY: "risky",
  UNKNOWN: "unknown"
};

const SMTP_RESULTS = {
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  UNKNOWN: "unknown"
};

module.exports = {
  COMMON_DOMAINS,
  ROLE_PREFIXES,
  FREEMAIL_DOMAINS,
  SEED_DISPOSABLE_DOMAINS,
  VERIFICATION_STATES,
  SMTP_RESULTS
};

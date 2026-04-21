// ============================================================
// OUTREACH SEQUENCE CONFIGURATION
// Defines email/SMS cadence, templates, and A/B variants
// ============================================================

module.exports = {
  sequences: {
    // Default multi-touch cadence
    standard: [
      {
        step: 1,
        type: "email",
        delayDays: 0,
        templateId: "initial_outreach",
        subject: "{{personalized_subject}}",
      },
      {
        step: 2,
        type: "email",
        delayDays: 3,
        templateId: "follow_up_1",
        subject: "Re: {{personalized_subject}}",
      },

      {
        step: 4,
        type: "email",
        delayDays: 7,
        templateId: "follow_up_2",
        subject: "Quick thought on {{company_name}}'s {{robotics_type}} systems",
      },
    ],
  },

  // Prompt templates passed to LLM for personalization
  promptTemplates: {
    initial_outreach: `You are a sales development representative at Leader, an AI pipeline company.
Write a personalized cold outreach email to {{contact_name}}, {{contact_title}} at {{company_name}}.

Company context: {{company_description}}
Company robotics type: {{robotics_type}}
Employee count: {{employee_count}}

Leader's value proposition: {{value_proposition}}

Rules:
- Keep it under 150 words
- Reference something specific about their company/product
- ONE clear call to action (15-min call)
- No fluff, no generic phrases
- Sound human, not salesy
- Include a compelling subject line at the top prefixed with "SUBJECT:"
- Then the email body

Tone: Professional but conversational`,

    follow_up_1: `Write a short, friendly follow-up email to {{contact_name}} at {{company_name}}.
This is the second touch after an initial email about Leader's pipeline capabilities.
Reference the initial email briefly. Add a new angle or insight about how T1 sensor applies to {{robotics_type}}.
Keep it under 80 words. Include subject line prefixed with "SUBJECT:"`,

    follow_up_2: `Write a final "breakup" style follow-up email to {{contact_name}} at {{company_name}}.
Keep it 50 words max. Be direct — either they're interested or not.
Mention Leader one last time. Include a simple yes/no CTA.
Include subject line prefixed with "SUBJECT:"`,


    response_summary: `Analyze this inbound email response from {{contact_name}} at {{company_name}} and extract:
1. INTENT: (Interested / Not Interested / Needs More Info / Wrong Person / Out of Office)
2. BUYING_SIGNALS: List any positive signals
3. TIMELINE: Any timeline mentioned
4. BUDGET: Any budget signals  
5. NEXT_ACTION: Recommended next step
6. URGENCY: (High / Medium / Low)
7. SUMMARY: One sentence summary

Email content:
{{email_content}}

Respond in JSON format only.`,

    draft_response: `Draft a professional reply email to {{contact_name}} at {{company_name}}.
Their message: {{their_message}}
Intent detected: {{intent}}
Next action: {{next_action}}
Keep it concise, helpful, and move toward booking a call or demo.
Include subject line prefixed with "SUBJECT:"`,
  },

  // Rate limiting and deliverability
  limits: {
    emailsPerHour: 50,
    emailsPerDay: 200,

    delayBetweenEmailsMs: 3000,
    domainWarmupDays: 14,
  },
};

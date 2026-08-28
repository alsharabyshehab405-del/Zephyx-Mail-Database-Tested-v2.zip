import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "artifacts" / "novamail-web" / "src" / "locales"
navigation_keys = {
    "commerceOrders": "Orders",
    "commerceFinance": "Finance inbox",
    "commerceSubscriptions": "Subscriptions",
    "commerceCatchUp": "Catch Up",
    "commerceTitle": "Commerce & review",
    "commerceDescription": "Facts are extracted from owned email content only. External tracking and payment providers are not configured.",
    "backToInbox": "Back to inbox",
    "commerceViews": "Commerce views",
    "loading": "Loading…",
    "catchUpDescription": "{count} unread inbox messages are ready for reversible review. Permanent delete is not part of this view.",
    "openInbox": "Open inbox",
    "noOrderFacts": "No order facts found in the current email page.",
    "unknownMerchant": "Unknown merchant",
    "orderPrefix": "Order",
    "orderNumberUnavailable": "number unavailable",
    "amountUnavailable": "Amount unavailable",
    "eta": "ETA",
    "trackingNotConfigured": "Tracking provider: NOT_CONFIGURED · source email retained",
    "noFinanceFacts": "No receipt, invoice, or bill facts found in the current email page.",
    "merchantUnavailable": "Merchant unavailable",
    "due": "Due",
    "noUnsubscribeLinks": "No manual unsubscribe links found. RFC List-Unsubscribe headers are not stored in the current email model.",
    "unsubscribeExplicitAction": "Opening a link requires your explicit action. No link is opened automatically.",
    "openUnsubscribeLink": "Open unsubscribe link",
    "confirmOpenUnsubscribe": "Open this external unsubscribe link? Zephyx Mail will not submit it automatically.",
    "unknownViewError": "Could not load this view",
    "unknownProvider": "NOT_CONFIGURED",
}
email_keys = {
    "smartSummary": "Smart Summary",
    "summaryReady": "Thread summary ready",
    "summaryNotConfigured": "No external AI provider is configured. The message was not sent to an AI service.",
    "summaryFailed": "Could not summarize thread",
    "summaryMode": "Summary mode",
    "shortSummary": "Short summary",
    "detailedSummary": "Detailed summary",
    "keyPoints": "Key points",
    "actionItems": "Action items",
    "importantDates": "Important dates",
    "deadlines": "Deadlines",
    "amounts": "Amounts",
    "peopleAndOrganizations": "People and organizations",
    "summarizeThread": "Summarize thread",
    "categoryAction": "Category",
    "actionCenter": "Action Center",
    "actionCenterSignals": "Deterministic signals · no provider",
    "signal": "Signal",
    "requires": "Requires",
    "suggestedNextAction": "Suggested next action:",
    "actionCenterLoadFailed": "Could not load Action Center",
    "categoryFailed": "Could not categorize email",
}

for locale_dir in sorted(p for p in root.iterdir() if p.is_dir()):
    navigation_path = locale_dir / "navigation.json"
    navigation = json.loads(navigation_path.read_text(encoding="utf-8"))
    navigation.update({key: navigation.get(key, value) for key, value in navigation_keys.items()})
    navigation_path.write_text(json.dumps(navigation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    email_path = locale_dir / "email.json"
    email = json.loads(email_path.read_text(encoding="utf-8"))
    email.update({key: email.get(key, value) for key, value in email_keys.items()})
    email_path.write_text(json.dumps(email, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

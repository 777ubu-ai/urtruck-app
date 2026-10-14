# Sanitized deployed FCM send method fixture; no credentials.
class FCMProvider:
    def send(self, token: str, title: str, body: str, data: dict, badge: Optional[int] = None) -> ProviderResult:
        project_id = FCM_PROJECT_ID or (_service_account_info() or {}).get("project_id")
        access_token = self._access_token()
        if not project_id or not access_token:
            return ProviderResult("fcm", "failed", error_code="provider_not_configured", retryable=False)
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": {str(k): "" if v is None else str(v) for k, v in (data or {}).items()},
                "android": {
                    "priority": "HIGH",
                    "notification": {
                        "channel_id": NATIVE_PUSH_CHANNEL_ID,
                        "sound": "default",
                        "notification_count": int(badge or 0),
                    },
                },
            }
        }
        try:
            resp = httpx.post(
                f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                json=payload,
                timeout=10.0,
            )
        except Exception as exc:
            return ProviderResult("fcm", "failed", error_code="network_error", response={"error": str(exc)}, retryable=True)
        try:
            body_json = resp.json()
        except Exception:
            body_json = {"text": resp.text[:500]}
        if resp.status_code < 400:
            return ProviderResult("fcm", "sent", message_id=body_json.get("name"), response=body_json)
        code, retryable = self.classify_error(resp.status_code, body_json)
        details = json.dumps(body_json, ensure_ascii=False)
        if "UNREGISTERED" in details or "registration-token-not-registered" in details:
            code, retryable = "invalid_token", False
        if "THIRD_PARTY_AUTH_ERROR" in details or "SENDER_ID_MISMATCH" in details:
            code, retryable = "invalid_credentials", False
        return ProviderResult("fcm", "failed", response=body_json, error_code=code, retryable=retryable)

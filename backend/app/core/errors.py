from typing import Any


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 422, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.details = details or {}

    def body(self) -> dict:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}

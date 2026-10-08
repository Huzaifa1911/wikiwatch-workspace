from enum import StrEnum


class Role(StrEnum):
    REVIEWER = "reviewer"
    LEAD = "lead"
    ADMIN = "admin"


class Status(StrEnum):
    UNCLAIMED = "unclaimed"
    CLAIMED = "claimed"
    OK = "ok"
    FLAGGED = "flagged"
    RETURNED = "returned"
    VERIFIED_FLAGGED = "verified_flagged"


class Operation(StrEnum):
    CLAIM = "claim"
    RELEASE = "release"
    OK = "ok"
    FLAG = "flag"
    ASSIGN = "assign"
    RETURN = "return"
    VERIFY = "verify"
    REOPEN = "reopen"

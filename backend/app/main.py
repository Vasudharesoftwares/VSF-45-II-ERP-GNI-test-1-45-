from datetime import datetime
from pathlib import Path
import json
import io

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker

ROOT = Path(__file__).resolve().parent.parent
engine = create_engine(
    f"sqlite:///{ROOT / 'vasudhare.db'}",
    connect_args={"check_same_thread": False}
)
Session = sessionmaker(bind=engine)
Base = declarative_base()

MODULES = [
    "orders", "inventory", "production",
    "employees", "tasks", "attendance", "payroll"
]

class Record(Base):
    __tablename__ = "records"
    id = Column(Integer, primary_key=True, index=True)
    module = Column(String(50), index=True, nullable=False)
    data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)



# ============================================================
# UNIVERSAL ERP CORE - COMPANY, BRANCH AND BUSINESS DIRECTORY
# ============================================================

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(40), unique=True, nullable=False, index=True)
    legal_name = Column(String(200), nullable=False)
    display_name = Column(String(200))
    country = Column(String(80), default="India", nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    timezone = Column(String(80), default="Asia/Kolkata", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_branch_company_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    name = Column(String(200), nullable=False)
    branch_type = Column(String(40), default="office")
    address = Column(Text)
    city = Column(String(100))
    state = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(80), default="India")
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Party(Base):
    __tablename__ = "parties"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_party_company_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    party_type = Column(String(30), nullable=False, index=True)
    name = Column(String(200), nullable=False, index=True)
    email = Column(String(200))
    phone = Column(String(40))
    tax_id = Column(String(40))
    billing_address = Column(Text)
    shipping_address = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(engine)

app = FastAPI(
    title="VASUDHARE SALESFORCE",
    description="Industrial Order, Inventory & Workforce Management System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RecordInput(BaseModel):
    data: dict

def output(r):
    return {
        "id": r.id,
        "module": r.module,
        "data": json.loads(r.data),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None
    }

@app.get("/")
def home():
    return {"business": "VASUDHARE SALESFORCE", "status": "running"}

@app.get("/api/health")
def health():
    return {"status": "healthy", "database": "connected"}

@app.get("/api/dashboard")
def dashboard():
    db = Session()
    try:
        rows = db.query(Record).all()
        counts = {m: 0 for m in MODULES}
        pending = 0

        for r in rows:
            counts[r.module] = counts.get(r.module, 0) + 1
            if r.module == "orders":
                data = json.loads(r.data)
                if data.get("status", "Received") not in ["Delivered", "Completed"]:
                    pending += 1

        return {
            "orders": counts["orders"],
            "pending_orders": pending,
            "inventory_items": counts["inventory"],
            "employees": counts["employees"],
            "production_batches": counts["production"],
            "tasks": counts["tasks"],
            "attendance_entries": counts["attendance"],
            "payroll_records": counts["payroll"]
        }
    finally:
        db.close()

@app.get("/api/{module}")
def list_records(module: str):
    if module not in MODULES:
        raise HTTPException(404, "Module not found")
    db = Session()
    try:
        rows = db.query(Record).filter(
            Record.module == module
        ).order_by(Record.id.desc()).all()
        return [output(r) for r in rows]
    finally:
        db.close()

@app.post("/api/{module}")
def create_record(module: str, payload: RecordInput):
    if module not in MODULES:
        raise HTTPException(404, "Module not found")
    db = Session()
    try:
        r = Record(module=module, data=json.dumps(payload.data))
        db.add(r)
        db.commit()
        db.refresh(r)
        return output(r)
    finally:
        db.close()

@app.put("/api/{module}/{record_id}")
def update_record(module: str, record_id: int, payload: RecordInput):
    if module not in MODULES:
        raise HTTPException(404, "Module not found")
    db = Session()
    try:
        r = db.query(Record).filter(
            Record.id == record_id, Record.module == module
        ).first()
        if not r:
            raise HTTPException(404, "Record not found")
        r.data = json.dumps(payload.data)
        r.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(r)
        return output(r)
    finally:
        db.close()

@app.delete("/api/{module}/{record_id}")
def delete_record(module: str, record_id: int):
    if module not in MODULES:
        raise HTTPException(404, "Module not found")
    db = Session()
    try:
        r = db.query(Record).filter(
            Record.id == record_id, Record.module == module
        ).first()
        if not r:
            raise HTTPException(404, "Record not found")
        db.delete(r)
        db.commit()
        return {"success": True}
    finally:
        db.close()

@app.get("/api/orders/{record_id}/pdf")
def order_pdf(record_id: int):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    db = Session()
    try:
        r = db.query(Record).filter(
            Record.id == record_id, Record.module == "orders"
        ).first()
        if not r:
            raise HTTPException(404, "Order not found")
        data = json.loads(r.data)
    finally:
        db.close()

    output_file = io.BytesIO()
    pdf = canvas.Canvas(output_file, pagesize=A4)
    width, height = A4

    pdf.setFillColorRGB(.08, .48, .32)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(48, height - 55, "VASUDHARE SALESFORCE")

    pdf.setFillColorRGB(.2, .25, .3)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(48, height - 95, "CUSTOMER ORDER")

    y = height - 140
    for label, key in [
        ("Order Number", "order_number"),
        ("Customer", "customer"),
        ("Product", "product"),
        ("Quantity", "quantity"),
        ("Rate", "rate"),
        ("Delivery Date", "delivery_date"),
        ("Status", "status"),
        ("Notes", "notes")
    ]:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(48, y, label + ":")
        pdf.setFont("Helvetica", 10)
        pdf.drawString(155, y, str(data.get(key, ""))[:75])
        y -= 26

    pdf.save()
    output_file.seek(0)
    return StreamingResponse(
        output_file,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="order-{record_id}.pdf"'
        }
    )


# ============================================================
# UNIVERSAL ERP CORE API
# ============================================================

class CompanyCreate(BaseModel):
    code: str
    legal_name: str
    display_name: str | None = None
    country: str = "India"
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"


class BranchCreate(BaseModel):
    code: str
    name: str
    branch_type: str = "office"
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str = "India"


class PartyCreate(BaseModel):
    code: str
    party_type: str
    name: str
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None


def company_output(c):
    return {
        "id": c.id,
        "code": c.code,
        "legal_name": c.legal_name,
        "display_name": c.display_name,
        "country": c.country,
        "currency": c.currency,
        "timezone": c.timezone,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def branch_output(b):
    return {
        "id": b.id,
        "company_id": b.company_id,
        "code": b.code,
        "name": b.name,
        "branch_type": b.branch_type,
        "address": b.address,
        "city": b.city,
        "state": b.state,
        "postal_code": b.postal_code,
        "country": b.country,
        "is_active": b.is_active,
    }


def party_output(p):
    return {
        "id": p.id,
        "company_id": p.company_id,
        "code": p.code,
        "party_type": p.party_type,
        "name": p.name,
        "email": p.email,
        "phone": p.phone,
        "tax_id": p.tax_id,
        "billing_address": p.billing_address,
        "shipping_address": p.shipping_address,
        "is_active": p.is_active,
    }


@app.get("/api/core/companies")
def core_list_companies():
    db = Session()
    try:
        rows = db.query(Company).order_by(Company.id.desc()).all()
        return [company_output(c) for c in rows]
    finally:
        db.close()


@app.post("/api/core/companies")
def core_create_company(payload: CompanyCreate):
    db = Session()
    try:
        code = payload.code.strip().upper()
        if not code or not payload.legal_name.strip():
            raise HTTPException(400, "Company code and legal name are required")
        if db.query(Company).filter(Company.code == code).first():
            raise HTTPException(409, "Company code already exists")

        company = Company(
            code=code,
            legal_name=payload.legal_name.strip(),
            display_name=payload.display_name.strip() if payload.display_name else None,
            country=payload.country.strip(),
            currency=payload.currency.strip().upper(),
            timezone=payload.timezone.strip(),
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        return company_output(company)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/core/companies/{company_id}/branches")
def core_list_branches(company_id: int):
    db = Session()
    try:
        if not db.query(Company).filter(Company.id == company_id).first():
            raise HTTPException(404, "Company not found")
        rows = db.query(Branch).filter(
            Branch.company_id == company_id
        ).order_by(Branch.id.desc()).all()
        return [branch_output(b) for b in rows]
    finally:
        db.close()


@app.post("/api/core/companies/{company_id}/branches")
def core_create_branch(company_id: int, payload: BranchCreate):
    db = Session()
    try:
        if not db.query(Company).filter(Company.id == company_id).first():
            raise HTTPException(404, "Company not found")

        code = payload.code.strip().upper()
        if not code or not payload.name.strip():
            raise HTTPException(400, "Branch code and name are required")

        duplicate = db.query(Branch).filter(
            Branch.company_id == company_id,
            Branch.code == code
        ).first()
        if duplicate:
            raise HTTPException(409, "Branch code already exists for this company")

        branch = Branch(
            company_id=company_id,
            code=code,
            name=payload.name.strip(),
            branch_type=payload.branch_type.strip().lower(),
            address=payload.address,
            city=payload.city,
            state=payload.state,
            postal_code=payload.postal_code,
            country=payload.country.strip(),
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)
        return branch_output(branch)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# Legacy public endpoint disabled; use authenticated CRM customer API.
def core_list_parties(company_id: int):
    db = Session()
    try:
        if not db.query(Company).filter(Company.id == company_id).first():
            raise HTTPException(404, "Company not found")
        rows = db.query(Party).filter(
            Party.company_id == company_id
        ).order_by(Party.id.desc()).all()
        return [party_output(p) for p in rows]
    finally:
        db.close()


# Legacy public endpoint disabled; use authenticated CRM customer API.
def core_create_party(company_id: int, payload: PartyCreate):
    db = Session()
    try:
        if not db.query(Company).filter(Company.id == company_id).first():
            raise HTTPException(404, "Company not found")

        code = payload.code.strip().upper()
        party_type = payload.party_type.strip().lower()
        allowed_types = {"customer", "supplier", "both", "other"}

        if party_type not in allowed_types:
            raise HTTPException(400, "Party type must be customer, supplier, both or other")
        if not code or not payload.name.strip():
            raise HTTPException(400, "Party code and name are required")

        duplicate = db.query(Party).filter(
            Party.company_id == company_id,
            Party.code == code
        ).first()
        if duplicate:
            raise HTTPException(409, "Party code already exists for this company")

        party = Party(
            company_id=company_id,
            code=code,
            party_type=party_type,
            name=payload.name.strip(),
            email=payload.email,
            phone=payload.phone,
            tax_id=payload.tax_id,
            billing_address=payload.billing_address,
            shipping_address=payload.shipping_address,
        )
        db.add(party)
        db.commit()
        db.refresh(party)
        return party_output(party)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ================= VASUDHARE_RBAC_V1 =================
# Universal ERP authentication and company-level access control.

import hashlib
import hmac
import secrets
from datetime import timedelta
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import ForeignKey, UniqueConstraint

RBAC_ROLES = {
    "owner": ["*"],
    "administrator": [
        "dashboard.read", "users.read", "users.create", "users.manage",
        "parties.read", "parties.create", "parties.manage",
        "orders.read", "orders.create", "orders.manage",
        "inventory.read", "inventory.manage",
        "production.read", "production.manage",
        "employees.read", "employees.manage",
        "tasks.read", "tasks.manage",
        "attendance.read", "attendance.manage",
        "finance.read", "finance.manage", "reports.read", "settings.manage"
    ],
    "manager": [
        "dashboard.read", "users.read", "parties.read",
        "orders.read", "orders.create", "orders.manage",
        "inventory.read", "production.read", "production.manage",
        "employees.read", "tasks.read", "tasks.manage",
        "attendance.read", "reports.read"
    ],
    "accountant": [
        "dashboard.read", "finance.read", "finance.manage",
        "orders.read", "parties.read", "reports.read"
    ],
    "supervisor": [
        "dashboard.read", "production.read", "production.manage",
        "inventory.read", "employees.read", "tasks.read", "tasks.manage",
        "attendance.read", "attendance.manage", "reports.read"
    ],
    "employee": [
        "tasks.read", "tasks.update", "attendance.read", "attendance.create"
    ],
    "auditor": [
        "dashboard.read", "users.read", "parties.read", "orders.read",
        "inventory.read", "production.read", "employees.read",
        "tasks.read", "attendance.read", "finance.read", "reports.read"
    ]
}

class ERPUser(Base):
    __tablename__ = "erp_users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ERPUserAssignment(Base):
    __tablename__ = "erp_user_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "company_id", name="uq_erp_user_company"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("erp_users.id"), nullable=False)
    company_id = Column(Integer, nullable=True, index=True)
    branch_id = Column(Integer, nullable=True)
    role = Column(String(40), nullable=False)
    permissions = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ERPAuthSession(Base):
    __tablename__ = "erp_auth_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("erp_users.id"), nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    company_id = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ERPAuditLog(Base):
    __tablename__ = "erp_audit_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(engine)

class ERPLoginInput(BaseModel):
    email: str
    password: str
    company_id: int | None = None

class ERPUserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    company_id: int | None = None
    branch_id: int | None = None
    role: str = "employee"

def erp_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 310000
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"

def erp_verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), 310000
        ).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False

def erp_audit(db, user_id, company_id, action, details=None):
    db.add(ERPAuditLog(
        user_id=user_id,
        company_id=company_id,
        action=action,
        details=details
    ))

def erp_assignment_permissions(role):
    return RBAC_ROLES.get(role, [])

def erp_has_permission(assignment, permission):
    if not assignment:
        return False
    try:
        permissions = json.loads(assignment.permissions)
    except (ValueError, TypeError):
        return False
    return "*" in permissions or permission in permissions

erp_bearer = HTTPBearer(auto_error=False)

def erp_current_context(
    credentials: HTTPAuthorizationCredentials = Depends(erp_bearer)
):
    if not credentials:
        raise HTTPException(401, "Authentication required")

    token_hash = hashlib.sha256(
        credentials.credentials.encode()
    ).hexdigest()

    db = Session()
    try:
        session = db.query(ERPAuthSession).filter(
            ERPAuthSession.token_hash == token_hash,
            ERPAuthSession.revoked == False,
            ERPAuthSession.expires_at > datetime.utcnow()
        ).first()

        if not session:
            raise HTTPException(401, "Invalid or expired session")

        user = db.query(ERPUser).filter(
            ERPUser.id == session.user_id,
            ERPUser.is_active == True
        ).first()

        if not user:
            raise HTTPException(401, "User is inactive or unavailable")

        assignment = db.query(ERPUserAssignment).filter(
            ERPUserAssignment.user_id == user.id,
            ERPUserAssignment.company_id == session.company_id
        ).first()

        return {
            "user_id": user.id,
            "name": user.full_name,
            "email": user.email,
            "company_id": session.company_id,
            "assignment": assignment,
            "global_owner": assignment is not None and assignment.role == "owner"
        }
    finally:
        db.close()

def erp_require(permission):
    def checker(context=Depends(erp_current_context)):
        if not erp_has_permission(context["assignment"], permission):
            raise HTTPException(403, f"Permission denied: {permission}")
        return context
    return checker

@app.post("/api/auth/login")
def erp_login(payload: ERPLoginInput):
    db = Session()
    try:
        user = db.query(ERPUser).filter(
            ERPUser.email == payload.email.strip().lower()
        ).first()

        if not user or not erp_verify_password(
            payload.password, user.password_hash
        ):
            raise HTTPException(401, "Invalid email or password")

        if not user.is_active:
            raise HTTPException(403, "User account is inactive")

        assignments = db.query(ERPUserAssignment).filter(
            ERPUserAssignment.user_id == user.id
        ).all()

        assignment = None
        if payload.company_id is not None:
            assignment = next(
                (a for a in assignments if a.company_id == payload.company_id),
                None
            )
            if not assignment:
                raise HTTPException(403, "User is not assigned to this company")
        elif assignments:
            assignment = assignments[0]

        token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        auth_session = ERPAuthSession(
            user_id=user.id,
            token_hash=token_hash,
            company_id=assignment.company_id if assignment else None,
            expires_at=datetime.utcnow() + timedelta(days=30)
        )
        db.add(auth_session)
        erp_audit(
            db, user.id,
            assignment.company_id if assignment else None,
            "login", "Successful login"
        )
        db.commit()

        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": 2592000,
            "user": {
                "id": user.id,
                "name": user.full_name,
                "email": user.email,
                "company_id": assignment.company_id if assignment else None,
                "role": assignment.role if assignment else None
            }
        }
    finally:
        db.close()

@app.post("/api/auth/logout")
def erp_logout(context=Depends(erp_current_context),
               credentials: HTTPAuthorizationCredentials = Depends(erp_bearer)):
    token_hash = hashlib.sha256(
        credentials.credentials.encode()
    ).hexdigest()

    db = Session()
    try:
        session = db.query(ERPAuthSession).filter(
            ERPAuthSession.token_hash == token_hash
        ).first()
        if session:
            session.revoked = True
            erp_audit(
                db, context["user_id"], context["company_id"],
                "logout", "User logged out"
            )
            db.commit()
        return {"success": True, "message": "Logged out"}
    finally:
        db.close()

@app.get("/api/auth/me")
def erp_me(context=Depends(erp_current_context)):
    assignment = context["assignment"]
    return {
        "id": context["user_id"],
        "name": context["name"],
        "email": context["email"],
        "company_id": context["company_id"],
        "role": assignment.role if assignment else None,
        "permissions": json.loads(assignment.permissions) if assignment else []
    }

@app.get("/api/auth/roles")
def erp_roles(context=Depends(erp_current_context)):
    if not context["global_owner"] and not erp_has_permission(
        context["assignment"], "users.read"
    ):
        raise HTTPException(403, "Permission denied")
    return [
        {"role": role, "permissions": permissions}
        for role, permissions in RBAC_ROLES.items()
    ]

@app.get("/api/users")
def erp_list_users(
    context=Depends(erp_require("users.read"))
):
    db = Session()
    try:
        rows = db.query(ERPUserAssignment).filter(
            ERPUserAssignment.company_id == context["company_id"]
        ).all()

        result = []
        for assignment in rows:
            user = db.query(ERPUser).filter(
                ERPUser.id == assignment.user_id
            ).first()
            if user:
                result.append({
                    "id": user.id,
                    "full_name": user.full_name,
                    "email": user.email,
                    "is_active": user.is_active,
                    "company_id": assignment.company_id,
                    "branch_id": assignment.branch_id,
                    "role": assignment.role
                })
        return result
    finally:
        db.close()

@app.post("/api/users")
def erp_create_user(
    payload: ERPUserCreate,
    context=Depends(erp_require("users.create"))
):
    role = payload.role.lower().strip()
    if role not in RBAC_ROLES:
        raise HTTPException(400, "Unknown role")
    if role == "owner":
        raise HTTPException(403, "Only the initial owner can establish another owner")

    if len(payload.password) < 12:
        raise HTTPException(400, "Password must contain at least 12 characters")

    if payload.company_id != context["company_id"]:
        raise HTTPException(403, "You can only create users in your active company")

    db = Session()
    try:
        email = payload.email.strip().lower()
        if db.query(ERPUser).filter(ERPUser.email == email).first():
            raise HTTPException(409, "Email already exists")

        user = ERPUser(
            full_name=payload.full_name.strip(),
            email=email,
            password_hash=erp_password_hash(payload.password)
        )
        db.add(user)
        db.flush()

        assignment = ERPUserAssignment(
            user_id=user.id,
            company_id=payload.company_id,
            branch_id=payload.branch_id,
            role=role,
            permissions=json.dumps(erp_assignment_permissions(role))
        )
        db.add(assignment)
        erp_audit(
            db, context["user_id"], context["company_id"],
            "user_created", f"Created user {email} with role {role}"
        )
        db.commit()

        return {
            "success": True,
            "user_id": user.id,
            "email": user.email,
            "role": role
        }
    finally:
        db.close()

@app.get("/api/audit-logs")
def erp_audit_logs(context=Depends(erp_require("reports.read"))):
    db = Session()
    try:
        rows = db.query(ERPAuditLog).filter(
            ERPAuditLog.company_id == context["company_id"]
        ).order_by(ERPAuditLog.id.desc()).limit(200).all()

        return [{
            "id": row.id,
            "user_id": row.user_id,
            "action": row.action,
            "details": row.details,
            "created_at": row.created_at.isoformat() if row.created_at else None
        } for row in rows]
    finally:
        db.close()

# ================= END VASUDHARE_RBAC_V1 =================

# ============================================================
# UNIVERSAL ERP - PRODUCT & SERVICE CATALOGUE
# ============================================================

from decimal import Decimal
from sqlalchemy import Numeric, CheckConstraint, UniqueConstraint

class ProductCategory(Base):
    __tablename__ = "product_categories"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_product_category_company_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    code = Column(String(50), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_uom_company_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    code = Column(String(30), nullable=False)
    name = Column(String(100), nullable=False)
    symbol = Column(String(20), nullable=False)
    decimal_places = Column(Integer, default=2, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("company_id", "sku", name="uq_product_company_sku"),
        CheckConstraint("purchase_price >= 0", name="ck_product_purchase_price"),
        CheckConstraint("selling_price >= 0", name="ck_product_selling_price"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="ck_product_tax_rate"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    sku = Column(String(80), nullable=False)
    barcode = Column(String(100), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    item_type = Column(String(20), default="product", nullable=False)
    track_inventory = Column(Boolean, default=True, nullable=False)
    purchase_price = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    selling_price = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    tax_rate = Column(Numeric(7, 4), default=Decimal("0.0000"), nullable=False)
    tax_inclusive = Column(Boolean, default=False, nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProductCategoryInput(BaseModel):
    code: str
    name: str
    description: str | None = None
    parent_id: int | None = None


class UnitInput(BaseModel):
    code: str
    name: str
    symbol: str
    decimal_places: int = 2


class ProductInput(BaseModel):
    sku: str
    name: str
    unit_id: int
    category_id: int | None = None
    barcode: str | None = None
    description: str | None = None
    item_type: str = "product"
    track_inventory: bool = True
    purchase_price: Decimal = Decimal("0.00")
    selling_price: Decimal = Decimal("0.00")
    tax_rate: Decimal = Decimal("0.0000")
    tax_inclusive: bool = False
    currency: str = "INR"


Base.metadata.create_all(bind=engine)


def product_company_access(company_id: int, context: dict):
    if not context.get("global_owner"):
        assignment = context.get("assignment")
        assigned_company = getattr(assignment, "company_id", None)
        if assigned_company != company_id:
            raise HTTPException(403, "You do not have access to this company.")

    db = Session()
    try:
        company = db.query(Company).filter(
            Company.id == company_id,
            Company.is_active == True
        ).first()
        if not company:
            raise HTTPException(404, "Company not found or inactive.")
    finally:
        db.close()


def product_output(p):
    return {
        "id": p.id,
        "company_id": p.company_id,
        "sku": p.sku,
        "barcode": p.barcode,
        "name": p.name,
        "description": p.description,
        "item_type": p.item_type,
        "category_id": p.category_id,
        "unit_id": p.unit_id,
        "track_inventory": p.track_inventory,
        "purchase_price": str(p.purchase_price),
        "selling_price": str(p.selling_price),
        "tax_rate": str(p.tax_rate),
        "tax_inclusive": p.tax_inclusive,
        "currency": p.currency,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@app.get("/api/core/companies/{company_id}/product-categories")
def product_categories_list(
    company_id: int,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ProductCategory).filter(
            ProductCategory.company_id == company_id
        ).order_by(ProductCategory.name).all()
        return [{
            "id": x.id, "code": x.code, "name": x.name,
            "description": x.description, "parent_id": x.parent_id,
            "is_active": x.is_active
        } for x in rows]
    finally:
        db.close()


@app.post("/api/core/companies/{company_id}/product-categories")
def product_category_create(
    company_id: int,
    payload: ProductCategoryInput,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)
    db = Session()
    try:
        if payload.parent_id:
            parent = db.query(ProductCategory).filter_by(
                id=payload.parent_id, company_id=company_id
            ).first()
            if not parent:
                raise HTTPException(400, "Parent category does not belong to this company.")

        row = ProductCategory(
            company_id=company_id,
            code=payload.code.strip().upper(),
            name=payload.name.strip(),
            description=payload.description,
            parent_id=payload.parent_id
        )
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Category code already exists or data is invalid.")
        return {"id": row.id, "code": row.code, "name": row.name}
    finally:
        db.close()


@app.get("/api/core/companies/{company_id}/units")
def units_list(
    company_id: int,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(UnitOfMeasure).filter(
            UnitOfMeasure.company_id == company_id
        ).order_by(UnitOfMeasure.name).all()
        return [{
            "id": x.id, "code": x.code, "name": x.name,
            "symbol": x.symbol, "decimal_places": x.decimal_places,
            "is_active": x.is_active
        } for x in rows]
    finally:
        db.close()


@app.post("/api/core/companies/{company_id}/units")
def unit_create(
    company_id: int,
    payload: UnitInput,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)
    if payload.decimal_places < 0 or payload.decimal_places > 6:
        raise HTTPException(400, "Decimal places must be between 0 and 6.")

    db = Session()
    try:
        row = UnitOfMeasure(
            company_id=company_id,
            code=payload.code.strip().upper(),
            name=payload.name.strip(),
            symbol=payload.symbol.strip(),
            decimal_places=payload.decimal_places
        )
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Unit code already exists or data is invalid.")
        return {"id": row.id, "code": row.code, "name": row.name, "symbol": row.symbol}
    finally:
        db.close()


@app.get("/api/core/companies/{company_id}/products")
def products_list(
    company_id: int,
    search: str | None = None,
    item_type: str | None = None,
    active: bool | None = None,
    limit: int = 100,
    offset: int = 0,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    db = Session()
    try:
        query = db.query(Product).filter(Product.company_id == company_id)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                (Product.name.ilike(term)) |
                (Product.sku.ilike(term)) |
                (Product.barcode.ilike(term))
            )
        if item_type:
            query = query.filter(Product.item_type == item_type)
        if active is not None:
            query = query.filter(Product.is_active == active)

        total = query.count()
        rows = query.order_by(Product.name).offset(offset).limit(limit).all()
        return {"items": [product_output(p) for p in rows], "total": total,
                "limit": limit, "offset": offset}
    finally:
        db.close()


@app.post("/api/core/companies/{company_id}/products")
def product_create(
    company_id: int,
    payload: ProductInput,
    context=Depends(erp_current_context)
):
    product_company_access(company_id, context)

    if payload.item_type not in ("product", "service", "digital"):
        raise HTTPException(400, "item_type must be product, service, or digital.")
    if payload.item_type != "product" and payload.track_inventory:
        raise HTTPException(400, "Services and digital items cannot track physical inventory.")
    if payload.purchase_price < 0 or payload.selling_price < 0:
        raise HTTPException(400, "Prices cannot be negative.")
    if payload.tax_rate < 0 or payload.tax_rate > 100:
        raise HTTPException(400, "Tax rate must be between 0 and 100.")

    db = Session()
    try:
        unit = db.query(UnitOfMeasure).filter_by(
            id=payload.unit_id, company_id=company_id, is_active=True
        ).first()
        if not unit:
            raise HTTPException(400, "Select an active unit belonging to this company.")

        if payload.category_id:
            category = db.query(ProductCategory).filter_by(
                id=payload.category_id, company_id=company_id, is_active=True
            ).first()
            if not category:
                raise HTTPException(400, "Category does not belong to this company.")

        row = Product(
            company_id=company_id,
            category_id=payload.category_id,
            unit_id=payload.unit_id,
            sku=payload.sku.strip().upper(),
            barcode=payload.barcode,
            name=payload.name.strip(),
            description=payload.description,
            item_type=payload.item_type,
            track_inventory=payload.track_inventory,
            purchase_price=payload.purchase_price,
            selling_price=payload.selling_price,
            tax_rate=payload.tax_rate,
            tax_inclusive=payload.tax_inclusive,
            currency=payload.currency.strip().upper()
        )
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "SKU already exists for this company or product data is invalid.")
        return product_output(row)
    finally:
        db.close()


@app.put("/api/core/products/{product_id}")
def product_update(
    product_id: int,
    payload: ProductInput,
    context=Depends(erp_current_context)
):
    db = Session()
    try:
        row = db.query(Product).filter_by(id=product_id).first()
        if not row:
            raise HTTPException(404, "Product not found.")
        product_company_access(row.company_id, context)

        if payload.item_type not in ("product", "service", "digital"):
            raise HTTPException(400, "Invalid item type.")
        if payload.item_type != "product" and payload.track_inventory:
            raise HTTPException(400, "Services and digital items cannot track physical inventory.")
        if payload.purchase_price < 0 or payload.selling_price < 0:
            raise HTTPException(400, "Prices cannot be negative.")
        if payload.tax_rate < 0 or payload.tax_rate > 100:
            raise HTTPException(400, "Tax rate must be between 0 and 100.")

        unit = db.query(UnitOfMeasure).filter_by(
            id=payload.unit_id, company_id=row.company_id, is_active=True
        ).first()
        if not unit:
            raise HTTPException(400, "Invalid unit for this company.")

        if payload.category_id:
            category = db.query(ProductCategory).filter_by(
                id=payload.category_id, company_id=row.company_id, is_active=True
            ).first()
            if not category:
                raise HTTPException(400, "Invalid category for this company.")

        for field, value in payload.model_dump().items():
            setattr(row, field, value.strip().upper() if field in ("sku", "currency") else value)
        row.updated_at = datetime.utcnow()
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "SKU already exists or product data is invalid.")
        return product_output(row)
    finally:
        db.close()


@app.patch("/api/core/products/{product_id}/deactivate")
def product_deactivate(
    product_id: int,
    context=Depends(erp_current_context)
):
    db = Session()
    try:
        row = db.query(Product).filter_by(id=product_id).first()
        if not row:
            raise HTTPException(404, "Product not found.")
        product_company_access(row.company_id, context)
        row.is_active = False
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Product deactivated.", "id": row.id}
    finally:
        db.close()



@app.patch("/api/core/products/{product_id}/activate")
def product_activate(
    product_id: int,
    context=Depends(erp_current_context)
):
    db = Session()
    try:
        row = db.query(Product).filter_by(id=product_id).first()
        if not row:
            raise HTTPException(404, "Product not found.")
        product_company_access(row.company_id, context)
        row.is_active = True
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Product activated.", "id": row.id}
    finally:
        db.close()


# ============================================================
# CRM: AUTHENTICATED CUSTOMERS AND ENQUIRIES
# ============================================================

class CRMEnquiry(Base):
    __tablename__ = "crm_enquiries"
    __table_args__ = (
        UniqueConstraint("company_id", "enquiry_no", name="uq_crm_enquiry_company_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    enquiry_no = Column(String(50), nullable=False)
    enquiry_date = Column(String(20), nullable=False)
    source = Column(String(60), nullable=True)
    subject = Column(String(250), nullable=False)
    product_requirement = Column(Text, nullable=True)
    estimated_value = Column(String(40), nullable=True)
    status = Column(String(40), nullable=False, default="New")
    next_follow_up = Column(String(20), nullable=True)
    owner = Column(String(150), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


class CRMCustomerInput(BaseModel):
    code: str
    name: str
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None


class CRMEnquiryInput(BaseModel):
    customer_id: int
    enquiry_no: str
    enquiry_date: str
    source: str | None = None
    subject: str
    product_requirement: str | None = None
    estimated_value: str | None = None
    status: str = "New"
    next_follow_up: str | None = None
    owner: str | None = None
    notes: str | None = None


def crm_customer_output(row):
    return party_output(row)


def crm_enquiry_output(row, customer=None):
    return {
        "id": row.id,
        "company_id": row.company_id,
        "customer_id": row.customer_id,
        "customer_name": customer.name if customer else None,
        "customer_code": customer.code if customer else None,
        "enquiry_no": row.enquiry_no,
        "enquiry_date": row.enquiry_date,
        "source": row.source,
        "subject": row.subject,
        "product_requirement": row.product_requirement,
        "estimated_value": row.estimated_value,
        "status": row.status,
        "next_follow_up": row.next_follow_up,
        "owner": row.owner,
        "notes": row.notes,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@app.get("/api/crm/companies/{company_id}/customers")
def crm_list_customers(
    company_id: int,
    search: str | None = None,
    active: bool | None = None,
    context=Depends(erp_require("parties.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(Party).filter(
            Party.company_id == company_id,
            Party.party_type.in_(["customer", "both"])
        )
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                Party.name.ilike(term) |
                Party.code.ilike(term) |
                Party.email.ilike(term) |
                Party.phone.ilike(term) |
                Party.tax_id.ilike(term)
            )
        if active is not None:
            query = query.filter(Party.is_active == active)
        rows = query.order_by(Party.name.asc()).limit(1000).all()
        return [crm_customer_output(row) for row in rows]
    finally:
        db.close()


@app.post("/api/crm/companies/{company_id}/customers")
def crm_create_customer(
    company_id: int,
    payload: CRMCustomerInput,
    context=Depends(erp_require("parties.create"))
):
    product_company_access(company_id, context)
    code = payload.code.strip().upper()
    name = payload.name.strip()
    if not code or not name:
        raise HTTPException(400, "Customer code and name are required.")

    db = Session()
    try:
        row = Party(
            company_id=company_id,
            code=code,
            party_type="customer",
            name=name,
            email=payload.email.strip() if payload.email else None,
            phone=payload.phone.strip() if payload.phone else None,
            tax_id=payload.tax_id.strip().upper() if payload.tax_id else None,
            billing_address=payload.billing_address,
            shipping_address=payload.shipping_address
        )
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Customer code already exists for this company.")
        return crm_customer_output(row)
    finally:
        db.close()


@app.put("/api/crm/customers/{customer_id}")
def crm_update_customer(
    customer_id: int,
    payload: CRMCustomerInput,
    context=Depends(erp_require("parties.manage"))
):
    db = Session()
    try:
        row = db.query(Party).filter(
            Party.id == customer_id,
            Party.party_type.in_(["customer", "both"])
        ).first()
        if not row:
            raise HTTPException(404, "Customer not found.")
        product_company_access(row.company_id, context)

        code = payload.code.strip().upper()
        name = payload.name.strip()
        if not code or not name:
            raise HTTPException(400, "Customer code and name are required.")

        row.code = code
        row.name = name
        row.email = payload.email.strip() if payload.email else None
        row.phone = payload.phone.strip() if payload.phone else None
        row.tax_id = payload.tax_id.strip().upper() if payload.tax_id else None
        row.billing_address = payload.billing_address
        row.shipping_address = payload.shipping_address

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Customer code already exists for this company.")
        return crm_customer_output(row)
    finally:
        db.close()


@app.patch("/api/crm/customers/{customer_id}/{action}")
def crm_customer_status(
    customer_id: int,
    action: str,
    context=Depends(erp_require("parties.manage"))
):
    if action not in ("activate", "deactivate"):
        raise HTTPException(400, "Action must be activate or deactivate.")
    db = Session()
    try:
        row = db.query(Party).filter(
            Party.id == customer_id,
            Party.party_type.in_(["customer", "both"])
        ).first()
        if not row:
            raise HTTPException(404, "Customer not found.")
        product_company_access(row.company_id, context)
        row.is_active = action == "activate"
        db.commit()
        return {"success": True, "id": row.id, "is_active": row.is_active}
    finally:
        db.close()


@app.get("/api/crm/companies/{company_id}/enquiries")
def crm_list_enquiries(
    company_id: int,
    search: str | None = None,
    status: str | None = None,
    context=Depends(erp_require("parties.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(CRMEnquiry).filter(
            CRMEnquiry.company_id == company_id
        )
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                CRMEnquiry.enquiry_no.ilike(term) |
                CRMEnquiry.subject.ilike(term) |
                CRMEnquiry.product_requirement.ilike(term)
            )
        if status:
            query = query.filter(CRMEnquiry.status == status)
        rows = query.order_by(CRMEnquiry.id.desc()).limit(1000).all()
        customer_ids = list({row.customer_id for row in rows})
        customers = {
            c.id: c for c in db.query(Party).filter(
                Party.id.in_(customer_ids),
                Party.company_id == company_id
            ).all()
        } if customer_ids else {}
        return [
            crm_enquiry_output(row, customers.get(row.customer_id))
            for row in rows
        ]
    finally:
        db.close()


@app.post("/api/crm/companies/{company_id}/enquiries")
def crm_create_enquiry(
    company_id: int,
    payload: CRMEnquiryInput,
    context=Depends(erp_require("parties.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == company_id,
            Party.party_type.in_(["customer", "both"]),
            Party.is_active == True
        ).first()
        if not customer:
            raise HTTPException(400, "Select an active customer belonging to this company.")

        number = payload.enquiry_no.strip().upper()
        subject = payload.subject.strip()
        if not number or not subject or not payload.enquiry_date.strip():
            raise HTTPException(400, "Enquiry number, date and subject are required.")

        row = CRMEnquiry(
            company_id=company_id,
            customer_id=payload.customer_id,
            enquiry_no=number,
            enquiry_date=payload.enquiry_date.strip(),
            source=payload.source,
            subject=subject,
            product_requirement=payload.product_requirement,
            estimated_value=payload.estimated_value,
            status=payload.status.strip() or "New",
            next_follow_up=payload.next_follow_up,
            owner=payload.owner,
            notes=payload.notes
        )
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Enquiry number already exists or enquiry data is invalid.")
        return crm_enquiry_output(row, customer)
    finally:
        db.close()


@app.put("/api/crm/enquiries/{enquiry_id}")
def crm_update_enquiry(
    enquiry_id: int,
    payload: CRMEnquiryInput,
    context=Depends(erp_require("parties.manage"))
):
    db = Session()
    try:
        row = db.query(CRMEnquiry).filter(
            CRMEnquiry.id == enquiry_id
        ).first()
        if not row:
            raise HTTPException(404, "Enquiry not found.")
        product_company_access(row.company_id, context)

        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == row.company_id,
            Party.party_type.in_(["customer", "both"]),
            Party.is_active == True
        ).first()
        if not customer:
            raise HTTPException(400, "Select an active customer belonging to this company.")

        row.customer_id = payload.customer_id
        row.enquiry_no = payload.enquiry_no.strip().upper()
        row.enquiry_date = payload.enquiry_date.strip()
        row.source = payload.source
        row.subject = payload.subject.strip()
        row.product_requirement = payload.product_requirement
        row.estimated_value = payload.estimated_value
        row.status = payload.status.strip() or "New"
        row.next_follow_up = payload.next_follow_up
        row.owner = payload.owner
        row.notes = payload.notes
        row.updated_at = datetime.utcnow()

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Enquiry number already exists or enquiry data is invalid.")
        return crm_enquiry_output(row, customer)
    finally:
        db.close()


@app.patch("/api/crm/enquiries/{enquiry_id}/{action}")
def crm_enquiry_status(
    enquiry_id: int,
    action: str,
    context=Depends(erp_require("parties.manage"))
):
    if action not in ("activate", "deactivate"):
        raise HTTPException(400, "Action must be activate or deactivate.")
    db = Session()
    try:
        row = db.query(CRMEnquiry).filter(
            CRMEnquiry.id == enquiry_id
        ).first()
        if not row:
            raise HTTPException(404, "Enquiry not found.")
        product_company_access(row.company_id, context)
        row.is_active = action == "activate"
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "id": row.id, "is_active": row.is_active}
    finally:
        db.close()



# ============================================================
# CRM: CALL LOGS AND FOLLOW-UP MANAGEMENT
# ============================================================

class CRMCall(Base):
    __tablename__ = "crm_calls"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    enquiry_id = Column(Integer, ForeignKey("crm_enquiries.id"), nullable=True, index=True)
    call_date = Column(String(30), nullable=False)
    direction = Column(String(20), nullable=False, default="Outgoing")
    contact_person = Column(String(150), nullable=True)
    phone = Column(String(40), nullable=True)
    outcome = Column(String(50), nullable=False, default="Connected")
    duration_minutes = Column(Integer, nullable=True)
    next_follow_up = Column(String(30), nullable=True)
    assigned_to = Column(String(150), nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


class CRMCallInput(BaseModel):
    customer_id: int
    enquiry_id: int | None = None
    call_date: str
    direction: str = "Outgoing"
    contact_person: str | None = None
    phone: str | None = None
    outcome: str = "Connected"
    duration_minutes: int | None = None
    next_follow_up: str | None = None
    assigned_to: str | None = None
    remarks: str | None = None


def crm_call_output(row, customer=None, enquiry=None):
    return {
        "id": row.id,
        "company_id": row.company_id,
        "customer_id": row.customer_id,
        "customer_name": customer.name if customer else None,
        "customer_code": customer.code if customer else None,
        "enquiry_id": row.enquiry_id,
        "enquiry_no": enquiry.enquiry_no if enquiry else None,
        "call_date": row.call_date,
        "direction": row.direction,
        "contact_person": row.contact_person,
        "phone": row.phone,
        "outcome": row.outcome,
        "duration_minutes": row.duration_minutes,
        "next_follow_up": row.next_follow_up,
        "assigned_to": row.assigned_to,
        "remarks": row.remarks,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def crm_call_related(db, row):
    customer = db.query(Party).filter(
        Party.id == row.customer_id,
        Party.company_id == row.company_id
    ).first()
    enquiry = None
    if row.enquiry_id:
        enquiry = db.query(CRMEnquiry).filter(
            CRMEnquiry.id == row.enquiry_id,
            CRMEnquiry.company_id == row.company_id
        ).first()
    return crm_call_output(row, customer, enquiry)


@app.get("/api/crm/companies/{company_id}/calls")
def crm_list_calls(
    company_id: int,
    search: str | None = None,
    outcome: str | None = None,
    context=Depends(erp_require("parties.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(CRMCall).filter(CRMCall.company_id == company_id)
        if outcome:
            query = query.filter(CRMCall.outcome == outcome)
        rows = query.order_by(CRMCall.id.desc()).limit(2000).all()
        results = [crm_call_related(db, row) for row in rows]
        if search:
            term = search.strip().lower()
            results = [
                item for item in results
                if any(term in str(item.get(k) or "").lower()
                       for k in ("customer_name", "customer_code", "enquiry_no",
                                 "phone", "contact_person", "outcome", "remarks",
                                 "assigned_to"))
            ]
        return results
    finally:
        db.close()


@app.post("/api/crm/companies/{company_id}/calls")
def crm_create_call(
    company_id: int,
    payload: CRMCallInput,
    context=Depends(erp_require("parties.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == company_id,
            Party.party_type.in_(["customer", "both"])
        ).first()
        if not customer:
            raise HTTPException(400, "Select a customer belonging to this company.")

        if payload.enquiry_id:
            enquiry = db.query(CRMEnquiry).filter(
                CRMEnquiry.id == payload.enquiry_id,
                CRMEnquiry.company_id == company_id,
                CRMEnquiry.customer_id == payload.customer_id
            ).first()
            if not enquiry:
                raise HTTPException(400, "Selected enquiry does not belong to this customer.")

        if not payload.call_date.strip():
            raise HTTPException(400, "Call date and time are required.")
        if payload.duration_minutes is not None and payload.duration_minutes < 0:
            raise HTTPException(400, "Call duration cannot be negative.")

        row = CRMCall(
            company_id=company_id,
            customer_id=payload.customer_id,
            enquiry_id=payload.enquiry_id,
            call_date=payload.call_date.strip(),
            direction=payload.direction,
            contact_person=payload.contact_person,
            phone=payload.phone,
            outcome=payload.outcome,
            duration_minutes=payload.duration_minutes,
            next_follow_up=payload.next_follow_up,
            assigned_to=payload.assigned_to,
            remarks=payload.remarks
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return crm_call_related(db, row)
    finally:
        db.close()


@app.put("/api/crm/calls/{call_id}")
def crm_update_call(
    call_id: int,
    payload: CRMCallInput,
    context=Depends(erp_require("parties.manage"))
):
    db = Session()
    try:
        row = db.query(CRMCall).filter(CRMCall.id == call_id).first()
        if not row:
            raise HTTPException(404, "Call record not found.")
        product_company_access(row.company_id, context)

        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == row.company_id,
            Party.party_type.in_(["customer", "both"])
        ).first()
        if not customer:
            raise HTTPException(400, "Select a customer belonging to this company.")

        if payload.enquiry_id:
            enquiry = db.query(CRMEnquiry).filter(
                CRMEnquiry.id == payload.enquiry_id,
                CRMEnquiry.company_id == row.company_id,
                CRMEnquiry.customer_id == payload.customer_id
            ).first()
            if not enquiry:
                raise HTTPException(400, "Selected enquiry does not belong to this customer.")

        if not payload.call_date.strip():
            raise HTTPException(400, "Call date and time are required.")

        for field in (
            "customer_id", "enquiry_id", "call_date", "direction",
            "contact_person", "phone", "outcome", "duration_minutes",
            "next_follow_up", "assigned_to", "remarks"
        ):
            setattr(row, field, getattr(payload, field))
        row.call_date = payload.call_date.strip()
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return crm_call_related(db, row)
    finally:
        db.close()

# ============================================================
# QUOTATIONS MODULE V1
# ============================================================

class Quotation(Base):
    __tablename__ = "quotations"
    __table_args__ = (
        UniqueConstraint("company_id", "quote_no", name="uq_quotation_company_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    enquiry_id = Column(Integer, ForeignKey("crm_enquiries.id"), nullable=True)
    quote_no = Column(String(60), nullable=False)
    quote_date = Column(String(20), nullable=False)
    valid_until = Column(String(20), nullable=True)
    status = Column(String(30), default="Draft", nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)
    discount_total = Column(Numeric(14, 2), default=0, nullable=False)
    tax_total = Column(Numeric(14, 2), default=0, nullable=False)
    grand_total = Column(Numeric(14, 2), default=0, nullable=False)
    terms = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class QuotationLine(Base):
    __tablename__ = "quotation_lines"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    sku = Column(String(80), nullable=True)
    description = Column(String(300), nullable=False)
    unit = Column(String(30), default="Nos", nullable=False)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    discount_percent = Column(Numeric(7, 4), default=0, nullable=False)
    tax_rate = Column(Numeric(7, 4), default=0, nullable=False)
    tax_inclusive = Column(Boolean, default=False, nullable=False)
    line_subtotal = Column(Numeric(14, 2), nullable=False)
    line_discount = Column(Numeric(14, 2), nullable=False)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    tax_amount = Column(Numeric(14, 2), nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)


class QuotationLineInput(BaseModel):
    product_id: int | None = None
    sku: str | None = None
    description: str
    unit: str = "Nos"
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")
    tax_inclusive: bool = False


class QuotationInput(BaseModel):
    customer_id: int
    enquiry_id: int | None = None
    quote_no: str
    quote_date: str
    valid_until: str | None = None
    currency: str = "INR"
    terms: str | None = None
    notes: str | None = None
    lines: list[QuotationLineInput]


def _quote_money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _quote_line_output(line):
    return {
        "id": line.id,
        "product_id": line.product_id,
        "sku": line.sku,
        "description": line.description,
        "unit": line.unit,
        "quantity": str(line.quantity),
        "unit_price": str(line.unit_price),
        "discount_percent": str(line.discount_percent),
        "tax_rate": str(line.tax_rate),
        "tax_inclusive": line.tax_inclusive,
        "line_subtotal": str(line.line_subtotal),
        "line_discount": str(line.line_discount),
        "taxable_amount": str(line.taxable_amount),
        "tax_amount": str(line.tax_amount),
        "line_total": str(line.line_total),
    }


def _quote_output(row, db):
    customer = db.query(Party).filter(Party.id == row.customer_id).first()
    enquiry = db.query(CRMEnquiry).filter(CRMEnquiry.id == row.enquiry_id).first() if row.enquiry_id else None
    lines = db.query(QuotationLine).filter(
        QuotationLine.quotation_id == row.id
    ).order_by(QuotationLine.id).all()

    return {
        "id": row.id,
        "company_id": row.company_id,
        "customer_id": row.customer_id,
        "customer_name": customer.name if customer else "",
        "customer_code": customer.code if customer else "",
        "customer_phone": customer.phone if customer else "",
        "customer_email": customer.email if customer else "",
        "customer_tax_id": customer.tax_id if customer else "",
        "customer_billing_address": customer.billing_address if customer else "",
        "enquiry_id": row.enquiry_id,
        "enquiry_no": enquiry.enquiry_no if enquiry else "",
        "quote_no": row.quote_no,
        "quote_date": row.quote_date,
        "valid_until": row.valid_until,
        "status": row.status,
        "currency": row.currency,
        "subtotal": str(row.subtotal),
        "discount_total": str(row.discount_total),
        "tax_total": str(row.tax_total),
        "grand_total": str(row.grand_total),
        "terms": row.terms,
        "notes": row.notes,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "lines": [_quote_line_output(line) for line in lines],
    }


def _quote_prepare_lines(db, company_id, payload):
    if not payload.lines or len(payload.lines) > 100:
        raise HTTPException(400, "A quotation must contain between 1 and 100 line items.")

    prepared = []
    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    grand_total = Decimal("0")

    for item in payload.lines:
        description = item.description.strip()
        quantity = Decimal(str(item.quantity))
        unit_price = Decimal(str(item.unit_price))
        discount_percent = Decimal(str(item.discount_percent))
        tax_rate = Decimal(str(item.tax_rate))
        sku = (item.sku or "").strip()
        unit = (item.unit or "Nos").strip() or "Nos"
        product_id = item.product_id
        tax_inclusive = item.tax_inclusive

        if not description:
            raise HTTPException(400, "Every quotation line needs a description.")
        if quantity <= 0:
            raise HTTPException(400, "Quantity must be greater than zero.")
        if unit_price < 0:
            raise HTTPException(400, "Unit price cannot be negative.")
        if discount_percent < 0 or discount_percent > 100:
            raise HTTPException(400, "Discount must be between 0 and 100%.")
        if tax_rate < 0 or tax_rate > 100:
            raise HTTPException(400, "Tax rate must be between 0 and 100%.")

        if product_id:
            product = db.query(Product).filter(
                Product.id == product_id,
                Product.company_id == company_id,
                Product.is_active == True
            ).first()
            if not product:
                raise HTTPException(400, "A selected product is unavailable or belongs to another company.")

            sku = product.sku
            description = product.name
            unit_row = db.query(UnitOfMeasure).filter(
                UnitOfMeasure.id == product.unit_id
            ).first()
            unit = unit_row.symbol if unit_row else unit
            tax_rate = Decimal(str(product.tax_rate))
            tax_inclusive = bool(product.tax_inclusive)

        base = _quote_money(quantity * unit_price)
        discount = _quote_money(base * discount_percent / Decimal("100"))
        after_discount = _quote_money(base - discount)

        if tax_inclusive and tax_rate > 0:
            taxable = _quote_money(after_discount / (Decimal("1") + tax_rate / Decimal("100")))
            tax = _quote_money(after_discount - taxable)
            total = after_discount
        else:
            taxable = after_discount
            tax = _quote_money(taxable * tax_rate / Decimal("100"))
            total = _quote_money(taxable + tax)

        prepared.append({
            "product_id": product_id,
            "sku": sku or None,
            "description": description,
            "unit": unit,
            "quantity": quantity,
            "unit_price": unit_price,
            "discount_percent": discount_percent,
            "tax_rate": tax_rate,
            "tax_inclusive": tax_inclusive,
            "line_subtotal": base,
            "line_discount": discount,
            "taxable_amount": taxable,
            "tax_amount": tax,
            "line_total": total,
        })

        subtotal += base
        discount_total += discount
        tax_total += tax
        grand_total += total

    return prepared, _quote_money(subtotal), _quote_money(discount_total), _quote_money(tax_total), _quote_money(grand_total)


@app.get("/api/crm/companies/{company_id}/quotations")
def quotation_list(
    company_id: int,
    search: str | None = None,
    status: str | None = None,
    context=Depends(erp_require("parties.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(Quotation).filter(Quotation.company_id == company_id)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                Quotation.quote_no.ilike(term) |
                Quotation.status.ilike(term)
            )
        if status and status != "All":
            query = query.filter(Quotation.status == status)
        rows = query.order_by(Quotation.id.desc()).limit(1000).all()
        return [_quote_output(row, db) for row in rows]
    finally:
        db.close()


@app.post("/api/crm/companies/{company_id}/quotations")
def quotation_create(
    company_id: int,
    payload: QuotationInput,
    context=Depends(erp_require("parties.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == company_id,
            Party.party_type.in_(["customer", "both"]),
            Party.is_active == True
        ).first()
        if not customer:
            raise HTTPException(400, "Select an active customer belonging to this company.")

        if payload.enquiry_id:
            enquiry = db.query(CRMEnquiry).filter(
                CRMEnquiry.id == payload.enquiry_id,
                CRMEnquiry.company_id == company_id,
                CRMEnquiry.customer_id == payload.customer_id
            ).first()
            if not enquiry:
                raise HTTPException(400, "The selected enquiry does not belong to this customer.")

        quote_no = payload.quote_no.strip().upper()
        if not quote_no or not payload.quote_date.strip():
            raise HTTPException(400, "Quotation number and date are required.")

        prepared, subtotal, discount, tax, total = _quote_prepare_lines(db, company_id, payload)

        row = Quotation(
            company_id=company_id,
            customer_id=payload.customer_id,
            enquiry_id=payload.enquiry_id,
            quote_no=quote_no,
            quote_date=payload.quote_date.strip(),
            valid_until=payload.valid_until,
            currency=payload.currency.strip().upper() or "INR",
            subtotal=subtotal,
            discount_total=discount,
            tax_total=tax,
            grand_total=total,
            terms=payload.terms,
            notes=payload.notes,
            created_by=context.get("name")
        )
        db.add(row)
        db.flush()

        for values in prepared:
            db.add(QuotationLine(quotation_id=row.id, **values))

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Quotation number already exists or quotation data is invalid.")

        return _quote_output(row, db)
    finally:
        db.close()


@app.put("/api/crm/quotations/{quotation_id}")
def quotation_update(
    quotation_id: int,
    payload: QuotationInput,
    context=Depends(erp_require("parties.manage"))
):
    db = Session()
    try:
        row = db.query(Quotation).filter(Quotation.id == quotation_id).first()
        if not row:
            raise HTTPException(404, "Quotation not found.")
        product_company_access(row.company_id, context)

        if row.status in ("Accepted", "Converted"):
            raise HTTPException(400, "Accepted or converted quotations cannot be edited.")

        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == row.company_id,
            Party.party_type.in_(["customer", "both"]),
            Party.is_active == True
        ).first()
        if not customer:
            raise HTTPException(400, "Select an active customer belonging to this company.")

        if payload.enquiry_id:
            enquiry = db.query(CRMEnquiry).filter(
                CRMEnquiry.id == payload.enquiry_id,
                CRMEnquiry.company_id == row.company_id,
                CRMEnquiry.customer_id == payload.customer_id
            ).first()
            if not enquiry:
                raise HTTPException(400, "The selected enquiry does not belong to this customer.")

        quote_no = payload.quote_no.strip().upper()
        if not quote_no or not payload.quote_date.strip():
            raise HTTPException(400, "Quotation number and date are required.")

        prepared, subtotal, discount, tax, total = _quote_prepare_lines(db, row.company_id, payload)

        row.customer_id = payload.customer_id
        row.enquiry_id = payload.enquiry_id
        row.quote_no = quote_no
        row.quote_date = payload.quote_date.strip()
        row.valid_until = payload.valid_until
        row.currency = payload.currency.strip().upper() or "INR"
        row.subtotal = subtotal
        row.discount_total = discount
        row.tax_total = tax
        row.grand_total = total
        row.terms = payload.terms
        row.notes = payload.notes
        row.updated_at = datetime.utcnow()

        db.query(QuotationLine).filter(
            QuotationLine.quotation_id == row.id
        ).delete(synchronize_session=False)

        for values in prepared:
            db.add(QuotationLine(quotation_id=row.id, **values))

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Quotation could not be updated. Check the quotation number.")

        return _quote_output(row, db)
    finally:
        db.close()


@app.patch("/api/crm/quotations/{quotation_id}/status")
def quotation_status(
    quotation_id: int,
    payload: dict,
    context=Depends(erp_require("parties.manage"))
):
    allowed = ("Draft", "Sent", "Accepted", "Rejected", "Expired")
    new_status = str(payload.get("status", "")).strip()
    if new_status not in allowed:
        raise HTTPException(400, "Invalid quotation status.")

    db = Session()
    try:
        row = db.query(Quotation).filter(Quotation.id == quotation_id).first()
        if not row:
            raise HTTPException(404, "Quotation not found.")
        product_company_access(row.company_id, context)
        if row.status == "Converted":
            raise HTTPException(400, "A converted quotation cannot change status.")
        row.status = new_status
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "id": row.id, "status": row.status}
    finally:
        db.close()


Base.metadata.create_all(bind=engine)



# ============================================================
# SALES ORDERS MODULE V1
# ============================================================

class SalesOrder(Base):
    __tablename__ = "sales_orders"
    __table_args__ = (
        UniqueConstraint("company_id", "order_no", name="uq_sales_order_company_number"),
        UniqueConstraint("quotation_id", name="uq_sales_order_quotation"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=True)
    enquiry_id = Column(Integer, ForeignKey("crm_enquiries.id"), nullable=True)
    order_no = Column(String(60), nullable=False)
    order_date = Column(String(20), nullable=False)
    promised_date = Column(String(20), nullable=True)
    status = Column(String(40), default="Confirmed", nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)
    discount_total = Column(Numeric(14, 2), default=0, nullable=False)
    tax_total = Column(Numeric(14, 2), default=0, nullable=False)
    grand_total = Column(Numeric(14, 2), default=0, nullable=False)
    terms = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id = Column(Integer, primary_key=True, index=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    sku = Column(String(80), nullable=True)
    description = Column(String(300), nullable=False)
    unit = Column(String(30), default="Nos", nullable=False)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    discount_percent = Column(Numeric(7, 4), default=0, nullable=False)
    tax_rate = Column(Numeric(7, 4), default=0, nullable=False)
    tax_inclusive = Column(Boolean, default=False, nullable=False)
    line_subtotal = Column(Numeric(14, 2), nullable=False)
    line_discount = Column(Numeric(14, 2), nullable=False)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    tax_amount = Column(Numeric(14, 2), nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)


class SalesOrderInput(BaseModel):
    customer_id: int
    enquiry_id: int | None = None
    order_no: str
    order_date: str
    promised_date: str | None = None
    currency: str = "INR"
    terms: str | None = None
    notes: str | None = None
    lines: list[QuotationLineInput]


def _sales_order_line_output(line):
    return _quote_line_output(line)


def _sales_order_output(row, db):
    customer = db.query(Party).filter(Party.id == row.customer_id).first()
    quote = db.query(Quotation).filter(Quotation.id == row.quotation_id).first() if row.quotation_id else None
    enquiry = db.query(CRMEnquiry).filter(CRMEnquiry.id == row.enquiry_id).first() if row.enquiry_id else None
    lines = db.query(SalesOrderLine).filter(
        SalesOrderLine.sales_order_id == row.id
    ).order_by(SalesOrderLine.id).all()

    return {
        "id": row.id,
        "company_id": row.company_id,
        "customer_id": row.customer_id,
        "customer_name": customer.name if customer else "",
        "customer_code": customer.code if customer else "",
        "customer_phone": customer.phone if customer else "",
        "customer_email": customer.email if customer else "",
        "customer_tax_id": customer.tax_id if customer else "",
        "customer_billing_address": customer.billing_address if customer else "",
        "quotation_id": row.quotation_id,
        "quote_no": quote.quote_no if quote else "",
        "enquiry_id": row.enquiry_id,
        "enquiry_no": enquiry.enquiry_no if enquiry else "",
        "order_no": row.order_no,
        "order_date": row.order_date,
        "promised_date": row.promised_date,
        "status": row.status,
        "currency": row.currency,
        "subtotal": str(row.subtotal),
        "discount_total": str(row.discount_total),
        "tax_total": str(row.tax_total),
        "grand_total": str(row.grand_total),
        "terms": row.terms,
        "notes": row.notes,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "lines": [_sales_order_line_output(line) for line in lines],
    }


def _sales_order_validate_customer(db, company_id, customer_id, enquiry_id):
    customer = db.query(Party).filter(
        Party.id == customer_id,
        Party.company_id == company_id,
        Party.party_type.in_(["customer", "both"]),
        Party.is_active == True
    ).first()
    if not customer:
        raise HTTPException(400, "Select an active customer belonging to this company.")

    if enquiry_id:
        enquiry = db.query(CRMEnquiry).filter(
            CRMEnquiry.id == enquiry_id,
            CRMEnquiry.company_id == company_id,
            CRMEnquiry.customer_id == customer_id
        ).first()
        if not enquiry:
            raise HTTPException(400, "The selected enquiry does not belong to this customer.")


@app.get("/api/sales/companies/{company_id}/orders")
def sales_order_list(
    company_id: int,
    search: str | None = None,
    status: str | None = None,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(SalesOrder).filter(SalesOrder.company_id == company_id)
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                SalesOrder.order_no.ilike(term) |
                SalesOrder.status.ilike(term)
            )
        if status and status != "All":
            query = query.filter(SalesOrder.status == status)
        rows = query.order_by(SalesOrder.id.desc()).limit(1000).all()
        return [_sales_order_output(row, db) for row in rows]
    finally:
        db.close()


@app.post("/api/sales/companies/{company_id}/orders")
def sales_order_create(
    company_id: int,
    payload: SalesOrderInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        _sales_order_validate_customer(db, company_id, payload.customer_id, payload.enquiry_id)

        order_no = payload.order_no.strip().upper()
        order_date = payload.order_date.strip()
        if not order_no or not order_date:
            raise HTTPException(400, "Order number and order date are required.")

        prepared, subtotal, discount, tax, total = _quote_prepare_lines(db, company_id, payload)

        row = SalesOrder(
            company_id=company_id,
            customer_id=payload.customer_id,
            enquiry_id=payload.enquiry_id,
            order_no=order_no,
            order_date=order_date,
            promised_date=payload.promised_date,
            status="Confirmed",
            currency=payload.currency.strip().upper() or "INR",
            subtotal=subtotal,
            discount_total=discount,
            tax_total=tax,
            grand_total=total,
            terms=payload.terms,
            notes=payload.notes,
            created_by=context.get("name")
        )
        db.add(row)
        db.flush()

        for values in prepared:
            db.add(SalesOrderLine(sales_order_id=row.id, **values))

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Order number already exists or order data is invalid.")

        return _sales_order_output(row, db)
    finally:
        db.close()


@app.post("/api/sales/companies/{company_id}/orders/from-quotation/{quotation_id}")
def sales_order_from_quotation(
    company_id: int,
    quotation_id: int,
    payload: dict,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        quote = db.query(Quotation).filter(
            Quotation.id == quotation_id,
            Quotation.company_id == company_id
        ).first()
        if not quote:
            raise HTTPException(404, "Quotation not found.")
        if quote.status != "Accepted":
            raise HTTPException(400, "Only accepted quotations can be converted to sales orders.")

        existing = db.query(SalesOrder).filter(
            SalesOrder.quotation_id == quote.id
        ).first()
        if existing:
            raise HTTPException(409, "This quotation has already been converted.")

        order_no = str(payload.get("order_no", "")).strip().upper()
        order_date = str(payload.get("order_date", "")).strip()
        promised_date = payload.get("promised_date")
        if not order_no or not order_date:
            raise HTTPException(400, "Order number and order date are required.")

        quote_lines = db.query(QuotationLine).filter(
            QuotationLine.quotation_id == quote.id
        ).order_by(QuotationLine.id).all()
        if not quote_lines:
            raise HTTPException(400, "The quotation has no line items.")

        row = SalesOrder(
            company_id=company_id,
            customer_id=quote.customer_id,
            quotation_id=quote.id,
            enquiry_id=quote.enquiry_id,
            order_no=order_no,
            order_date=order_date,
            promised_date=promised_date,
            status="Confirmed",
            currency=quote.currency,
            subtotal=quote.subtotal,
            discount_total=quote.discount_total,
            tax_total=quote.tax_total,
            grand_total=quote.grand_total,
            terms=quote.terms,
            notes=quote.notes,
            created_by=context.get("name")
        )
        db.add(row)
        db.flush()

        for line in quote_lines:
            db.add(SalesOrderLine(
                sales_order_id=row.id,
                product_id=line.product_id,
                sku=line.sku,
                description=line.description,
                unit=line.unit,
                quantity=line.quantity,
                unit_price=line.unit_price,
                discount_percent=line.discount_percent,
                tax_rate=line.tax_rate,
                tax_inclusive=line.tax_inclusive,
                line_subtotal=line.line_subtotal,
                line_discount=line.line_discount,
                taxable_amount=line.taxable_amount,
                tax_amount=line.tax_amount,
                line_total=line.line_total
            ))

        quote.status = "Converted"
        quote.updated_at = datetime.utcnow()

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Order could not be created. Check the order number or quotation conversion status.")

        return _sales_order_output(row, db)
    finally:
        db.close()


@app.put("/api/sales/orders/{order_id}")
def sales_order_update(
    order_id: int,
    payload: SalesOrderInput,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        row = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
        if not row:
            raise HTTPException(404, "Sales order not found.")
        product_company_access(row.company_id, context)

        if row.quotation_id:
            raise HTTPException(400, "Orders converted from quotations are locked to preserve quotation history.")

        _sales_order_validate_customer(db, row.company_id, payload.customer_id, payload.enquiry_id)

        order_no = payload.order_no.strip().upper()
        order_date = payload.order_date.strip()
        if not order_no or not order_date:
            raise HTTPException(400, "Order number and order date are required.")

        prepared, subtotal, discount, tax, total = _quote_prepare_lines(db, row.company_id, payload)

        row.customer_id = payload.customer_id
        row.enquiry_id = payload.enquiry_id
        row.order_no = order_no
        row.order_date = order_date
        row.promised_date = payload.promised_date
        row.currency = payload.currency.strip().upper() or "INR"
        row.subtotal = subtotal
        row.discount_total = discount
        row.tax_total = tax
        row.grand_total = total
        row.terms = payload.terms
        row.notes = payload.notes
        row.updated_at = datetime.utcnow()

        db.query(SalesOrderLine).filter(
            SalesOrderLine.sales_order_id == row.id
        ).delete(synchronize_session=False)

        for values in prepared:
            db.add(SalesOrderLine(sales_order_id=row.id, **values))

        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Sales order could not be updated. Check the order number.")

        return _sales_order_output(row, db)
    finally:
        db.close()


@app.patch("/api/sales/orders/{order_id}/status")
def sales_order_status(
    order_id: int,
    payload: dict,
    context=Depends(erp_require("orders.manage"))
):
    allowed = (
        "Confirmed", "In Production", "Ready for Dispatch",
        "Dispatched", "Completed", "On Hold", "Cancelled"
    )
    new_status = str(payload.get("status", "")).strip()
    if new_status not in allowed:
        raise HTTPException(400, "Invalid sales order status.")

    db = Session()
    try:
        row = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
        if not row:
            raise HTTPException(404, "Sales order not found.")
        product_company_access(row.company_id, context)
        row.status = new_status
        row.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "id": row.id, "status": row.status}
    finally:
        db.close()


Base.metadata.create_all(bind=engine)


# ============================================================
# PURCHASE & VENDORS MODULE V1
# ============================================================

class VendorProfile(Base):
    __tablename__ = "vendor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=False, unique=True, index=True)
    contact_person = Column(String(150), nullable=True)
    payment_terms = Column(String(100), default="Immediate", nullable=False)
    credit_limit = Column(Numeric(14, 2), default=Decimal("0.00"), nullable=False)
    bank_name = Column(String(150), nullable=True)
    bank_account = Column(String(80), nullable=True)
    ifsc = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class VendorInput(BaseModel):
    code: str
    name: str
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None
    billing_address: str | None = None
    shipping_address: str | None = None
    contact_person: str | None = None
    payment_terms: str = "Immediate"
    credit_limit: Decimal = Decimal("0.00")
    bank_name: str | None = None
    bank_account: str | None = None
    ifsc: str | None = None
    notes: str | None = None


def vendor_output(db, party):
    profile = db.query(VendorProfile).filter(
        VendorProfile.party_id == party.id
    ).first()

    return {
        "id": party.id,
        "company_id": party.company_id,
        "code": party.code,
        "name": party.name,
        "email": party.email,
        "phone": party.phone,
        "tax_id": party.tax_id,
        "billing_address": party.billing_address,
        "shipping_address": party.shipping_address,
        "is_active": party.is_active,
        "contact_person": profile.contact_person if profile else None,
        "payment_terms": profile.payment_terms if profile else "Immediate",
        "credit_limit": str(profile.credit_limit if profile else Decimal("0.00")),
        "bank_name": profile.bank_name if profile else None,
        "bank_account": profile.bank_account if profile else None,
        "ifsc": profile.ifsc if profile else None,
        "notes": profile.notes if profile else None,
    }


def vendor_apply(db, party, payload):
    party.code = payload.code.strip().upper()
    party.name = payload.name.strip()
    party.email = payload.email.strip() if payload.email else None
    party.phone = payload.phone.strip() if payload.phone else None
    party.tax_id = payload.tax_id.strip() if payload.tax_id else None
    party.billing_address = payload.billing_address
    party.shipping_address = payload.shipping_address

    profile = db.query(VendorProfile).filter(
        VendorProfile.party_id == party.id
    ).first()

    if not profile:
        profile = VendorProfile(party_id=party.id)
        db.add(profile)

    profile.contact_person = payload.contact_person
    profile.payment_terms = payload.payment_terms.strip() or "Immediate"
    profile.credit_limit = payload.credit_limit
    profile.bank_name = payload.bank_name
    profile.bank_account = payload.bank_account
    profile.ifsc = payload.ifsc
    profile.notes = payload.notes


@app.get("/api/purchase/companies/{company_id}/vendors")
def purchase_list_vendors(
    company_id: int,
    search: str | None = None,
    active: bool | None = None,
    context=Depends(erp_require("parties.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(Party).filter(
            Party.company_id == company_id,
            Party.party_type.in_(["supplier", "both"])
        )
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                Party.name.ilike(term) |
                Party.code.ilike(term) |
                Party.phone.ilike(term) |
                Party.email.ilike(term)
            )
        if active is not None:
            query = query.filter(Party.is_active == active)

        rows = query.order_by(Party.name).all()
        return {
            "items": [vendor_output(db, row) for row in rows],
            "total": len(rows)
        }
    finally:
        db.close()


@app.post("/api/purchase/companies/{company_id}/vendors")
def purchase_create_vendor(
    company_id: int,
    payload: VendorInput,
    context=Depends(erp_require("parties.create"))
):
    product_company_access(company_id, context)

    code = payload.code.strip().upper()
    name = payload.name.strip()
    if not code or not name:
        raise HTTPException(400, "Vendor code and name are required.")
    if payload.credit_limit < 0:
        raise HTTPException(400, "Credit limit cannot be negative.")

    db = Session()
    try:
        duplicate = db.query(Party).filter(
            Party.company_id == company_id,
            Party.code == code
        ).first()
        if duplicate:
            raise HTTPException(409, "This party code already exists in the company.")

        party = Party(
            company_id=company_id,
            code=code,
            party_type="supplier",
            name=name,
            is_active=True
        )
        db.add(party)
        db.flush()
        vendor_apply(db, party, payload)
        db.commit()
        db.refresh(party)
        return vendor_output(db, party)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.put("/api/purchase/vendors/{vendor_id}")
def purchase_update_vendor(
    vendor_id: int,
    payload: VendorInput,
    context=Depends(erp_require("parties.manage"))
):
    db = Session()
    try:
        party = db.query(Party).filter(
            Party.id == vendor_id,
            Party.party_type.in_(["supplier", "both"])
        ).first()
        if not party:
            raise HTTPException(404, "Vendor not found.")

        product_company_access(party.company_id, context)

        code = payload.code.strip().upper()
        name = payload.name.strip()
        if not code or not name:
            raise HTTPException(400, "Vendor code and name are required.")
        if payload.credit_limit < 0:
            raise HTTPException(400, "Credit limit cannot be negative.")

        duplicate = db.query(Party).filter(
            Party.company_id == party.company_id,
            Party.code == code,
            Party.id != party.id
        ).first()
        if duplicate:
            raise HTTPException(409, "This party code already exists in the company.")

        vendor_apply(db, party, payload)
        db.commit()
        db.refresh(party)
        return vendor_output(db, party)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/purchase/vendors/{vendor_id}/{action}")
def purchase_vendor_status(
    vendor_id: int,
    action: str,
    context=Depends(erp_require("parties.manage"))
):
    if action not in ("activate", "deactivate"):
        raise HTTPException(400, "Action must be activate or deactivate.")

    db = Session()
    try:
        party = db.query(Party).filter(
            Party.id == vendor_id,
            Party.party_type.in_(["supplier", "both"])
        ).first()
        if not party:
            raise HTTPException(404, "Vendor not found.")

        product_company_access(party.company_id, context)
        party.is_active = action == "activate"
        db.commit()
        db.refresh(party)
        return vendor_output(db, party)
    finally:
        db.close()


Base.metadata.create_all(bind=engine)


# ============================================================
# PURCHASE ORDERS MODULE V1
# ============================================================

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint("company_id", "po_no", name="uq_purchase_order_company_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    po_no = Column(String(60), nullable=False)
    po_date = Column(String(20), nullable=False)
    expected_date = Column(String(20), nullable=True)
    status = Column(String(30), default="Draft", nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)
    discount_total = Column(Numeric(14, 2), default=0, nullable=False)
    tax_total = Column(Numeric(14, 2), default=0, nullable=False)
    grand_total = Column(Numeric(14, 2), default=0, nullable=False)
    terms = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    sku = Column(String(80), nullable=True)
    description = Column(String(500), nullable=False)
    unit = Column(String(30), nullable=True)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    discount_percent = Column(Numeric(7, 4), default=0, nullable=False)
    tax_rate = Column(Numeric(7, 4), default=0, nullable=False)
    line_subtotal = Column(Numeric(14, 2), nullable=False)
    line_discount = Column(Numeric(14, 2), nullable=False)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    tax_amount = Column(Numeric(14, 2), nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)


class PurchaseOrderLineInput(BaseModel):
    product_id: int
    description: str | None = None
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")


class PurchaseOrderInput(BaseModel):
    vendor_id: int
    po_no: str
    po_date: str
    expected_date: str | None = None
    currency: str = "INR"
    terms: str | None = None
    notes: str | None = None
    lines: list[PurchaseOrderLineInput]


def _po_money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _po_output(db, po):
    vendor = db.query(Party).filter(Party.id == po.vendor_id).first()
    lines = db.query(PurchaseOrderLine).filter(
        PurchaseOrderLine.purchase_order_id == po.id
    ).all()

    return {
        "id": po.id,
        "company_id": po.company_id,
        "vendor_id": po.vendor_id,
        "vendor_name": vendor.name if vendor else None,
        "vendor_code": vendor.code if vendor else None,
        "po_no": po.po_no,
        "po_date": po.po_date,
        "expected_date": po.expected_date,
        "status": po.status,
        "currency": po.currency,
        "subtotal": str(po.subtotal),
        "discount_total": str(po.discount_total),
        "tax_total": str(po.tax_total),
        "grand_total": str(po.grand_total),
        "terms": po.terms,
        "notes": po.notes,
        "lines": [{
            "id": line.id,
            "product_id": line.product_id,
            "sku": line.sku,
            "description": line.description,
            "unit": line.unit,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "discount_percent": str(line.discount_percent),
            "tax_rate": str(line.tax_rate),
            "line_subtotal": str(line.line_subtotal),
            "line_discount": str(line.line_discount),
            "taxable_amount": str(line.taxable_amount),
            "tax_amount": str(line.tax_amount),
            "line_total": str(line.line_total),
        } for line in lines],
        "created_at": po.created_at.isoformat() if po.created_at else None,
    }


def _po_replace_lines(db, po, payload):
    if not payload.lines:
        raise HTTPException(400, "At least one purchase order line is required.")

    db.query(PurchaseOrderLine).filter(
        PurchaseOrderLine.purchase_order_id == po.id
    ).delete()

    subtotal = Decimal("0")
    discount_total = Decimal("0")
    tax_total = Decimal("0")
    grand_total = Decimal("0")

    for item in payload.lines:
        if item.quantity <= 0:
            raise HTTPException(400, "Product quantity must be greater than zero.")
        if item.unit_price < 0:
            raise HTTPException(400, "Unit price cannot be negative.")
        if item.discount_percent < 0 or item.discount_percent > 100:
            raise HTTPException(400, "Discount must be between 0 and 100 percent.")
        if item.tax_rate < 0 or item.tax_rate > 100:
            raise HTTPException(400, "Tax rate must be between 0 and 100 percent.")

        product = db.query(Product).filter(
            Product.id == item.product_id,
            Product.company_id == po.company_id,
            Product.is_active == True
        ).first()
        if not product:
            raise HTTPException(400, f"Product {item.product_id} not found or inactive.")

        unit = db.query(UnitOfMeasure).filter(
            UnitOfMeasure.id == product.unit_id
        ).first() if product.unit_id else None

        line_subtotal = _po_money(item.quantity * item.unit_price)
        line_discount = _po_money(line_subtotal * item.discount_percent / Decimal("100"))
        taxable = _po_money(line_subtotal - line_discount)
        tax = _po_money(taxable * item.tax_rate / Decimal("100"))
        total = _po_money(taxable + tax)

        db.add(PurchaseOrderLine(
            purchase_order_id=po.id,
            product_id=product.id,
            sku=product.sku,
            description=(item.description or product.name).strip(),
            unit=unit.symbol if unit else None,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_percent=item.discount_percent,
            tax_rate=item.tax_rate,
            line_subtotal=line_subtotal,
            line_discount=line_discount,
            taxable_amount=taxable,
            tax_amount=tax,
            line_total=total,
        ))

        subtotal += line_subtotal
        discount_total += line_discount
        tax_total += tax
        grand_total += total

    po.subtotal = _po_money(subtotal)
    po.discount_total = _po_money(discount_total)
    po.tax_total = _po_money(tax_total)
    po.grand_total = _po_money(grand_total)


@app.get("/api/purchase/companies/{company_id}/orders")
def purchase_list_orders(
    company_id: int,
    search: str | None = None,
    status: str | None = None,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        query = db.query(PurchaseOrder).filter(
            PurchaseOrder.company_id == company_id
        )
        if search:
            term = f"%{search.strip()}%"
            query = query.filter(PurchaseOrder.po_no.ilike(term))
        if status:
            query = query.filter(PurchaseOrder.status == status)
        rows = query.order_by(PurchaseOrder.id.desc()).all()
        return {"items": [_po_output(db, row) for row in rows], "total": len(rows)}
    finally:
        db.close()


@app.post("/api/purchase/companies/{company_id}/orders")
def purchase_create_order(
    company_id: int,
    payload: PurchaseOrderInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        vendor = db.query(Party).filter(
            Party.id == payload.vendor_id,
            Party.company_id == company_id,
            Party.party_type.in_(["supplier", "both"]),
            Party.is_active == True
        ).first()
        if not vendor:
            raise HTTPException(400, "Select an active vendor belonging to this company.")

        po_no = payload.po_no.strip().upper()
        if not po_no:
            raise HTTPException(400, "Purchase order number is required.")
        if db.query(PurchaseOrder).filter(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.po_no == po_no
        ).first():
            raise HTTPException(409, "This purchase order number already exists.")

        po = PurchaseOrder(
            company_id=company_id,
            vendor_id=payload.vendor_id,
            po_no=po_no,
            po_date=payload.po_date,
            expected_date=payload.expected_date,
            status="Draft",
            currency=payload.currency.strip().upper() or "INR",
            terms=payload.terms,
            notes=payload.notes,
        )
        db.add(po)
        db.flush()
        _po_replace_lines(db, po, payload)
        db.commit()
        db.refresh(po)
        return _po_output(db, po)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.put("/api/purchase/orders/{order_id}")
def purchase_update_order(
    order_id: int,
    payload: PurchaseOrderInput,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        po = db.query(PurchaseOrder).filter(
            PurchaseOrder.id == order_id
        ).first()
        if not po:
            raise HTTPException(404, "Purchase order not found.")
        product_company_access(po.company_id, context)

        if po.status != "Draft":
            raise HTTPException(400, "Only Draft purchase orders can be edited.")

        vendor = db.query(Party).filter(
            Party.id == payload.vendor_id,
            Party.company_id == po.company_id,
            Party.party_type.in_(["supplier", "both"]),
            Party.is_active == True
        ).first()
        if not vendor:
            raise HTTPException(400, "Select an active vendor belonging to this company.")

        po.vendor_id = payload.vendor_id
        po.po_no = payload.po_no.strip().upper()
        po.po_date = payload.po_date
        po.expected_date = payload.expected_date
        po.currency = payload.currency.strip().upper() or "INR"
        po.terms = payload.terms
        po.notes = payload.notes

        duplicate = db.query(PurchaseOrder).filter(
            PurchaseOrder.company_id == po.company_id,
            PurchaseOrder.po_no == po.po_no,
            PurchaseOrder.id != po.id
        ).first()
        if duplicate:
            raise HTTPException(409, "This purchase order number already exists.")

        _po_replace_lines(db, po, payload)
        db.commit()
        db.refresh(po)
        return _po_output(db, po)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/purchase/orders/{order_id}/status")
def purchase_update_order_status(
    order_id: int,
    payload: dict,
    context=Depends(erp_require("orders.manage"))
):
    allowed = ["Submitted", "Approved", "Rejected", "Cancelled"]
    new_status = str(payload.get("status", "")).strip()
    if new_status not in allowed:
        raise HTTPException(400, "Invalid purchase order status.")

    db = Session()
    try:
        po = db.query(PurchaseOrder).filter(
            PurchaseOrder.id == order_id
        ).first()
        if not po:
            raise HTTPException(404, "Purchase order not found.")
        product_company_access(po.company_id, context)

        transitions = {
            "Draft": ["Submitted", "Cancelled"],
            "Submitted": ["Approved", "Rejected", "Cancelled"],
            "Rejected": ["Draft", "Cancelled"],
            "Approved": ["Cancelled"],
            "Cancelled": [],
        }
        if new_status not in transitions.get(po.status, []):
            raise HTTPException(400, f"Cannot change status from {po.status} to {new_status}.")

        po.status = new_status
        db.commit()
        db.refresh(po)
        return _po_output(db, po)
    finally:
        db.close()


Base.metadata.create_all(bind=engine)


# ============================================================
# GOODS RECEIPT NOTES AND STOCK LEDGER V1
# ============================================================

class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"
    __table_args__ = (
        UniqueConstraint("company_id", "grn_no", name="uq_grn_company_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    grn_no = Column(String(60), nullable=False)
    receipt_date = Column(String(20), nullable=False)
    location = Column(String(150), nullable=True)
    status = Column(String(20), default="Draft", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)


class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    id = Column(Integer, primary_key=True, index=True)
    goods_receipt_id = Column(Integer, ForeignKey("goods_receipts.id"), nullable=False, index=True)
    purchase_order_line_id = Column(Integer, ForeignKey("purchase_order_lines.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    received_qty = Column(Numeric(14, 3), nullable=False)
    accepted_qty = Column(Numeric(14, 3), nullable=False)
    rejected_qty = Column(Numeric(14, 3), nullable=False)
    notes = Column(Text, nullable=True)


class InventoryLedger(Base):
    __tablename__ = "inventory_ledger"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    transaction_type = Column(String(30), nullable=False)
    reference_type = Column(String(30), nullable=False)
    reference_id = Column(Integer, nullable=False, index=True)
    reference_no = Column(String(60), nullable=False)
    transaction_date = Column(String(20), nullable=False)
    quantity_in = Column(Numeric(14, 3), default=0, nullable=False)
    quantity_out = Column(Numeric(14, 3), default=0, nullable=False)
    unit_cost = Column(Numeric(14, 2), default=0, nullable=False)
    location = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class GoodsReceiptLineInput(BaseModel):
    purchase_order_line_id: int
    received_qty: Decimal
    accepted_qty: Decimal
    rejected_qty: Decimal
    notes: str | None = None


class GoodsReceiptInput(BaseModel):
    purchase_order_id: int
    grn_no: str
    receipt_date: str
    location: str | None = None
    notes: str | None = None
    lines: list[GoodsReceiptLineInput]


def _grn_output(db, grn):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.id == grn.purchase_order_id
    ).first()
    vendor = db.query(Party).filter(
        Party.id == grn.vendor_id
    ).first()
    lines = db.query(GoodsReceiptLine).filter(
        GoodsReceiptLine.goods_receipt_id == grn.id
    ).all()

    result_lines = []
    for line in lines:
        product = db.query(Product).filter(Product.id == line.product_id).first()
        po_line = db.query(PurchaseOrderLine).filter(
            PurchaseOrderLine.id == line.purchase_order_line_id
        ).first()
        result_lines.append({
            "id": line.id,
            "purchase_order_line_id": line.purchase_order_line_id,
            "product_id": line.product_id,
            "product_name": product.name if product else None,
            "sku": product.sku if product else None,
            "ordered_qty": str(po_line.quantity) if po_line else "0",
            "received_qty": str(line.received_qty),
            "accepted_qty": str(line.accepted_qty),
            "rejected_qty": str(line.rejected_qty),
            "notes": line.notes,
        })

    return {
        "id": grn.id,
        "company_id": grn.company_id,
        "purchase_order_id": grn.purchase_order_id,
        "po_no": po.po_no if po else None,
        "vendor_id": grn.vendor_id,
        "vendor_name": vendor.name if vendor else None,
        "grn_no": grn.grn_no,
        "receipt_date": grn.receipt_date,
        "location": grn.location,
        "status": grn.status,
        "notes": grn.notes,
        "posted_at": grn.posted_at.isoformat() if grn.posted_at else None,
        "lines": result_lines,
    }


def _grn_validate_lines(db, po, payload):
    if not payload.lines:
        raise HTTPException(400, "At least one receipt line is required.")

    seen = set()
    prepared = []

    for item in payload.lines:
        if item.purchase_order_line_id in seen:
            raise HTTPException(400, "A purchase order line can appear only once per GRN.")
        seen.add(item.purchase_order_line_id)

        if item.received_qty <= 0 or item.accepted_qty < 0 or item.rejected_qty < 0:
            raise HTTPException(400, "Received quantity must be positive; accepted and rejected quantities cannot be negative.")
        if item.accepted_qty + item.rejected_qty != item.received_qty:
            raise HTTPException(400, "Accepted quantity plus rejected quantity must equal received quantity.")

        po_line = db.query(PurchaseOrderLine).filter(
            PurchaseOrderLine.id == item.purchase_order_line_id,
            PurchaseOrderLine.purchase_order_id == po.id
        ).first()
        if not po_line:
            raise HTTPException(400, "A receipt line does not belong to the selected purchase order.")

        posted_rows = db.query(GoodsReceiptLine).join(
            GoodsReceipt,
            GoodsReceipt.id == GoodsReceiptLine.goods_receipt_id
        ).filter(
            GoodsReceiptLine.purchase_order_line_id == po_line.id,
            GoodsReceipt.status == "Posted"
        ).all()

        already_received = sum(
            (Decimal(str(row.received_qty)) for row in posted_rows),
            Decimal("0")
        )
        remaining = Decimal(str(po_line.quantity)) - already_received

        if item.received_qty > remaining:
            raise HTTPException(
                400,
                f"Receipt exceeds outstanding quantity for {po_line.sku or po_line.description}. Remaining: {remaining}"
            )

        prepared.append((item, po_line))

    return prepared


@app.get("/api/purchase/companies/{company_id}/receipts")
def purchase_list_receipts(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(GoodsReceipt).filter(
            GoodsReceipt.company_id == company_id
        ).order_by(GoodsReceipt.id.desc()).all()
        return {"items": [_grn_output(db, row) for row in rows], "total": len(rows)}
    finally:
        db.close()


@app.post("/api/purchase/companies/{company_id}/receipts")
def purchase_create_receipt(
    company_id: int,
    payload: GoodsReceiptInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        po = db.query(PurchaseOrder).filter(
            PurchaseOrder.id == payload.purchase_order_id,
            PurchaseOrder.company_id == company_id
        ).first()
        if not po:
            raise HTTPException(404, "Purchase order not found.")
        if po.status != "Approved":
            raise HTTPException(400, "Only Approved purchase orders can receive goods.")

        location = (payload.location or "").strip()
        warehouse = db.query(InventoryWarehouse).filter(
            InventoryWarehouse.company_id == company_id,
            InventoryWarehouse.name == location,
            InventoryWarehouse.is_active == True
        ).first()
        if not warehouse:
            raise HTTPException(
                400,
                "Select an active warehouse belonging to this company."
            )

        grn_no = payload.grn_no.strip().upper()
        if not grn_no:
            raise HTTPException(400, "GRN number is required.")
        if db.query(GoodsReceipt).filter(
            GoodsReceipt.company_id == company_id,
            GoodsReceipt.grn_no == grn_no
        ).first():
            raise HTTPException(409, "This GRN number already exists.")

        prepared = _grn_validate_lines(db, po, payload)

        grn = GoodsReceipt(
            company_id=company_id,
            purchase_order_id=po.id,
            vendor_id=po.vendor_id,
            grn_no=grn_no,
            receipt_date=payload.receipt_date,
            location=warehouse.name,
            status="Draft",
            notes=payload.notes,
        )
        db.add(grn)
        db.flush()

        for item, po_line in prepared:
            db.add(GoodsReceiptLine(
                goods_receipt_id=grn.id,
                purchase_order_line_id=po_line.id,
                product_id=po_line.product_id,
                received_qty=item.received_qty,
                accepted_qty=item.accepted_qty,
                rejected_qty=item.rejected_qty,
                notes=item.notes,
            ))

        db.commit()
        db.refresh(grn)
        return _grn_output(db, grn)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/purchase/receipts/{receipt_id}/post")
def purchase_post_receipt(
    receipt_id: int,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        grn = db.query(GoodsReceipt).filter(
            GoodsReceipt.id == receipt_id
        ).with_for_update().first()
        if not grn:
            raise HTTPException(404, "Goods receipt not found.")

        product_company_access(grn.company_id, context)

        if grn.status != "Draft":
            raise HTTPException(400, "Only Draft receipts can be posted.")

        po = db.query(PurchaseOrder).filter(
            PurchaseOrder.id == grn.purchase_order_id
        ).first()
        if not po or po.status != "Approved":
            raise HTTPException(400, "The linked purchase order must remain Approved.")

        lines = db.query(GoodsReceiptLine).filter(
            GoodsReceiptLine.goods_receipt_id == grn.id
        ).all()
        if not lines:
            raise HTTPException(400, "This receipt has no lines.")

        # Recheck quantities at posting time to prevent over-receipt.
        for line in lines:
            po_line = db.query(PurchaseOrderLine).filter(
                PurchaseOrderLine.id == line.purchase_order_line_id
            ).first()
            if not po_line:
                raise HTTPException(400, "Linked purchase order line is missing.")

            other_posted = db.query(GoodsReceiptLine).join(
                GoodsReceipt,
                GoodsReceipt.id == GoodsReceiptLine.goods_receipt_id
            ).filter(
                GoodsReceiptLine.purchase_order_line_id == po_line.id,
                GoodsReceipt.status == "Posted",
                GoodsReceipt.id != grn.id
            ).all()

            already_received = sum(
                (Decimal(str(row.received_qty)) for row in other_posted),
                Decimal("0")
            )
            remaining = Decimal(str(po_line.quantity)) - already_received

            if Decimal(str(line.received_qty)) > remaining:
                raise HTTPException(
                    400,
                    f"Cannot post: receipt exceeds outstanding quantity for {po_line.sku or po_line.description}. Remaining: {remaining}"
                )

            if Decimal(str(line.accepted_qty)) + Decimal(str(line.rejected_qty)) != Decimal(str(line.received_qty)):
                raise HTTPException(400, "Accepted and rejected quantities do not match received quantity.")

            if Decimal(str(line.accepted_qty)) > 0:
                db.add(InventoryLedger(
                    company_id=grn.company_id,
                    product_id=line.product_id,
                    transaction_type="GRN Receipt",
                    reference_type="GRN",
                    reference_id=grn.id,
                    reference_no=grn.grn_no,
                    transaction_date=grn.receipt_date,
                    quantity_in=line.accepted_qty,
                    quantity_out=Decimal("0"),
                    unit_cost=po_line.unit_price,
                    location=grn.location,
                ))

        grn.status = "Posted"
        grn.posted_at = datetime.utcnow()
        db.commit()
        db.refresh(grn)
        return _grn_output(db, grn)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/inventory/companies/{company_id}/stock")
def inventory_stock_summary(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        products = db.query(Product).filter(
            Product.company_id == company_id,
            Product.track_inventory == True
        ).order_by(Product.name).all()

        items = []
        for product in products:
            ledger_rows = db.query(InventoryLedger).filter(
                InventoryLedger.company_id == company_id,
                InventoryLedger.product_id == product.id
            ).all()

            quantity_in = sum(
                (Decimal(str(row.quantity_in)) for row in ledger_rows),
                Decimal("0")
            )
            quantity_out = sum(
                (Decimal(str(row.quantity_out)) for row in ledger_rows),
                Decimal("0")
            )
            items.append({
                "product_id": product.id,
                "sku": product.sku,
                "name": product.name,
                "quantity_in": str(quantity_in),
                "quantity_out": str(quantity_out),
                "on_hand": str(quantity_in - quantity_out),
            })

        return {"items": items, "total": len(items)}
    finally:
        db.close()


Base.metadata.create_all(bind=engine)


# ============================================================
# INVENTORY CONTROL: WAREHOUSES, STOCK MOVEMENTS AND LEDGER
# ============================================================

class InventoryWarehouse(Base):
    __tablename__ = "inventory_warehouses"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    name = Column(String(150), nullable=False)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    movement_no = Column(String(60), nullable=False)
    movement_type = Column(String(30), nullable=False)
    movement_date = Column(String(20), nullable=False)
    status = Column(String(20), default="Draft", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)


class InventoryMovementLine(Base):
    __tablename__ = "inventory_movement_lines"

    id = Column(Integer, primary_key=True, index=True)
    movement_id = Column(Integer, ForeignKey("inventory_movements.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_cost = Column(Numeric(14, 2), default=0, nullable=False)
    source_location = Column(String(150), nullable=True)
    destination_location = Column(String(150), nullable=True)
    direction = Column(String(10), nullable=True)
    reason = Column(Text, nullable=True)


class InventoryWarehouseInput(BaseModel):
    code: str
    name: str
    address: str | None = None


class InventoryMovementLineInput(BaseModel):
    product_id: int
    quantity: Decimal
    unit_cost: Decimal = Decimal("0")
    source_location: str | None = None
    destination_location: str | None = None
    direction: str | None = None
    reason: str | None = None


class InventoryMovementInput(BaseModel):
    movement_no: str
    movement_type: str
    movement_date: str
    notes: str | None = None
    lines: list[InventoryMovementLineInput]


def _inventory_location_balance(db, company_id, product_id, location):
    rows = db.query(InventoryLedger).filter(
        InventoryLedger.company_id == company_id,
        InventoryLedger.product_id == product_id,
        InventoryLedger.location == location
    ).all()
    incoming = sum((Decimal(str(row.quantity_in or 0)) for row in rows), Decimal("0"))
    outgoing = sum((Decimal(str(row.quantity_out or 0)) for row in rows), Decimal("0"))
    return incoming - outgoing


def _inventory_opening_stock_exists(db, company_id, product_id, location, exclude_movement_id=None):
    posted = db.query(InventoryLedger).filter(
        InventoryLedger.company_id == company_id,
        InventoryLedger.product_id == product_id,
        InventoryLedger.transaction_type == "Opening Stock",
        InventoryLedger.location == location
    ).first()
    drafts = db.query(InventoryMovementLine).join(
        InventoryMovement,
        InventoryMovement.id == InventoryMovementLine.movement_id
    ).filter(
        InventoryMovement.company_id == company_id,
        InventoryMovement.movement_type == "Opening Stock",
        InventoryMovement.status == "Draft",
        InventoryMovementLine.product_id == product_id,
        InventoryMovementLine.destination_location == location
    )
    if exclude_movement_id is not None:
        drafts = drafts.filter(InventoryMovement.id != exclude_movement_id)
    return posted is not None or drafts.first() is not None


def _inventory_movement_output(db, movement):
    lines = db.query(InventoryMovementLine).filter(
        InventoryMovementLine.movement_id == movement.id
    ).all()
    result_lines = []
    for line in lines:
        product = db.query(Product).filter(Product.id == line.product_id).first()
        result_lines.append({
            "id": line.id,
            "product_id": line.product_id,
            "sku": product.sku if product else "",
            "product_name": product.name if product else "",
            "quantity": str(line.quantity),
            "unit_cost": str(line.unit_cost),
            "source_location": line.source_location,
            "destination_location": line.destination_location,
            "direction": line.direction,
            "reason": line.reason,
        })
    return {
        "id": movement.id,
        "company_id": movement.company_id,
        "movement_no": movement.movement_no,
        "movement_type": movement.movement_type,
        "movement_date": movement.movement_date,
        "status": movement.status,
        "notes": movement.notes,
        "posted_at": movement.posted_at.isoformat() if movement.posted_at else None,
        "lines": result_lines,
    }


def _inventory_validate_movement(db, company_id, payload):
    movement_type = payload.movement_type.strip().title()
    if movement_type not in ["Transfer", "Issue", "Adjustment", "Opening Stock"]:
        raise HTTPException(400, "Invalid movement type.")
    if not payload.lines:
        raise HTTPException(400, "Add at least one product line.")

    prepared = []
    opening_seen = set()
    for item in payload.lines:
        if item.quantity <= 0:
            raise HTTPException(400, "Movement quantities must be greater than zero.")
        if item.unit_cost < 0:
            raise HTTPException(400, "Unit cost cannot be negative.")

        product = db.query(Product).filter(
            Product.id == item.product_id,
            Product.company_id == company_id,
            Product.track_inventory == True
        ).first()
        if not product:
            raise HTTPException(400, f"Invalid inventory product ID: {item.product_id}")

        source = (item.source_location or "").strip()
        destination = (item.destination_location or "").strip()
        direction = (item.direction or "").strip().upper()

        if movement_type == "Transfer":
            if not source or not destination or source.casefold() == destination.casefold():
                raise HTTPException(400, "Transfer requires two different locations.")
        elif movement_type == "Issue":
            if not source:
                raise HTTPException(400, "Issue requires a source location.")
            destination = ""
            direction = "OUT"
        elif movement_type == "Opening Stock":
            if not destination:
                raise HTTPException(400, "Select a warehouse for opening stock.")
            if direction not in ["", "IN"]:
                raise HTTPException(400, "Opening stock must increase inventory.")
            direction = "IN"
            source = ""

            warehouse_rows = db.query(InventoryWarehouse).filter(
                InventoryWarehouse.company_id == company_id,
                InventoryWarehouse.is_active == True
            ).all()
            valid_locations = {w.name.casefold(): w.name for w in warehouse_rows}
            if destination.casefold() not in valid_locations:
                raise HTTPException(400, "Select an active warehouse belonging to this company.")
            destination = valid_locations[destination.casefold()]

            opening_key = (item.product_id, destination.casefold())
            if opening_key in opening_seen:
                raise HTTPException(409, "A product can appear only once per opening stock entry and warehouse.")
            opening_seen.add(opening_key)

            if _inventory_opening_stock_exists(db, company_id, item.product_id, destination):
                raise HTTPException(
                    409,
                    f"Opening stock already exists or is in draft for this product at {destination}."
                )
        else:
            if not destination:
                destination = source
            if not destination:
                raise HTTPException(400, "Adjustment requires a stock location.")
            if direction not in ["IN", "OUT"]:
                raise HTTPException(400, "Adjustment direction must be IN or OUT.")
            source = ""

        prepared.append({
            "product": product,
            "quantity": item.quantity,
            "unit_cost": item.unit_cost,
            "source_location": source or None,
            "destination_location": destination or None,
            "direction": direction or None,
            "reason": item.reason,
        })
    return movement_type, prepared


@app.get("/api/inventory/companies/{company_id}/warehouses")
def inventory_list_warehouses(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(InventoryWarehouse).filter(
            InventoryWarehouse.company_id == company_id
        ).order_by(InventoryWarehouse.name).all()
        return {"items": [{
            "id": row.id,
            "code": row.code,
            "name": row.name,
            "address": row.address,
            "is_active": row.is_active,
        } for row in rows], "total": len(rows)}
    finally:
        db.close()


@app.post("/api/inventory/companies/{company_id}/warehouses")
def inventory_create_warehouse(
    company_id: int,
    payload: InventoryWarehouseInput,
    context=Depends(erp_require("orders.manage"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        code = payload.code.strip().upper()
        name = payload.name.strip()
        if not code or not name:
            raise HTTPException(400, "Warehouse code and name are required.")
        exists = db.query(InventoryWarehouse).filter(
            InventoryWarehouse.company_id == company_id,
            InventoryWarehouse.code == code
        ).first()
        if exists:
            raise HTTPException(409, "Warehouse code already exists.")
        row = InventoryWarehouse(
            company_id=company_id,
            code=code,
            name=name,
            address=payload.address
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "code": row.code, "name": row.name,
                "address": row.address, "is_active": row.is_active}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/inventory/companies/{company_id}/movements")
def inventory_list_movements(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(InventoryMovement).filter(
            InventoryMovement.company_id == company_id
        ).order_by(InventoryMovement.id.desc()).limit(500).all()
        return {"items": [_inventory_movement_output(db, row) for row in rows],
                "total": len(rows)}
    finally:
        db.close()


@app.post("/api/inventory/companies/{company_id}/movements")
def inventory_create_movement(
    company_id: int,
    payload: InventoryMovementInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        movement_no = payload.movement_no.strip().upper()
        if not movement_no:
            raise HTTPException(400, "Movement number is required.")
        duplicate = db.query(InventoryMovement).filter(
            InventoryMovement.company_id == company_id,
            InventoryMovement.movement_no == movement_no
        ).first()
        if duplicate:
            raise HTTPException(409, "Movement number already exists.")

        movement_type, prepared = _inventory_validate_movement(db, company_id, payload)
        row = InventoryMovement(
            company_id=company_id,
            movement_no=movement_no,
            movement_type=movement_type,
            movement_date=payload.movement_date,
            status="Draft",
            notes=payload.notes
        )
        db.add(row)
        db.flush()

        for item in prepared:
            db.add(InventoryMovementLine(
                movement_id=row.id,
                product_id=item["product"].id,
                quantity=item["quantity"],
                unit_cost=item["unit_cost"],
                source_location=item["source_location"],
                destination_location=item["destination_location"],
                direction=item["direction"],
                reason=item["reason"]
            ))
        db.commit()
        db.refresh(row)
        return _inventory_movement_output(db, row)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/inventory/movements/{movement_id}/post")
def inventory_post_movement(
    movement_id: int,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        movement = db.query(InventoryMovement).filter(
            InventoryMovement.id == movement_id
        ).first()
        if not movement:
            raise HTTPException(404, "Inventory movement not found.")
        product_company_access(movement.company_id, context)
        if movement.status != "Draft":
            raise HTTPException(400, "Only draft movements can be posted.")

        lines = db.query(InventoryMovementLine).filter(
            InventoryMovementLine.movement_id == movement.id
        ).all()
        if not lines:
            raise HTTPException(400, "Movement has no product lines.")

        if movement.movement_type == "Opening Stock":
            for line in lines:
                if _inventory_opening_stock_exists(
                    db,
                    movement.company_id,
                    line.product_id,
                    line.destination_location,
                    exclude_movement_id=movement.id
                ):
                    raise HTTPException(
                        409,
                        "Opening stock already exists for this product and warehouse. This draft cannot be posted."
                    )

        for line in lines:
            quantity = Decimal(str(line.quantity))
            if movement.movement_type in ["Transfer", "Issue"] or (
                movement.movement_type == "Adjustment" and line.direction == "OUT"
            ):
                available = _inventory_location_balance(
                    db, movement.company_id, line.product_id, line.source_location
                )
                if available < quantity:
                    product = db.query(Product).filter(Product.id == line.product_id).first()
                    raise HTTPException(
                        400,
                        f"Insufficient stock for {product.name if product else line.product_id} "
                        f"at {line.source_location}. Available: {available}, required: {quantity}."
                    )

        for line in lines:
            quantity = Decimal(str(line.quantity))
            reference_no = movement.movement_no
            if movement.movement_type == "Transfer":
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Transfer Out",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=0,
                    quantity_out=quantity,
                    unit_cost=line.unit_cost,
                    location=line.source_location
                ))
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Transfer In",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=quantity,
                    quantity_out=0,
                    unit_cost=line.unit_cost,
                    location=line.destination_location
                ))
            elif movement.movement_type == "Issue":
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Material Issue",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=0,
                    quantity_out=quantity,
                    unit_cost=line.unit_cost,
                    location=line.source_location
                ))
            elif movement.movement_type == "Opening Stock":
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Opening Stock",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=quantity,
                    quantity_out=0,
                    unit_cost=line.unit_cost,
                    location=line.destination_location
                ))
            elif line.direction == "IN":
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Stock Adjustment In",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=quantity,
                    quantity_out=0,
                    unit_cost=line.unit_cost,
                    location=line.destination_location
                ))
            else:
                db.add(InventoryLedger(
                    company_id=movement.company_id,
                    product_id=line.product_id,
                    transaction_type="Stock Adjustment Out",
                    reference_type="StockMovement",
                    reference_id=movement.id,
                    reference_no=reference_no,
                    transaction_date=movement.movement_date,
                    quantity_in=0,
                    quantity_out=quantity,
                    unit_cost=line.unit_cost,
                    location=line.destination_location
                ))

        movement.status = "Posted"
        movement.posted_at = datetime.utcnow()
        db.commit()
        db.refresh(movement)
        return _inventory_movement_output(db, movement)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/inventory/companies/{company_id}/stock-by-location")
def inventory_stock_by_location(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        products = db.query(Product).filter(
            Product.company_id == company_id,
            Product.track_inventory == True
        ).order_by(Product.name).all()
        ledger_rows = db.query(InventoryLedger).filter(
            InventoryLedger.company_id == company_id
        ).all()

        balances = {}
        for entry in ledger_rows:
            location = entry.location or "Unassigned"
            key = (entry.product_id, location)
            if key not in balances:
                balances[key] = {"quantity_in": Decimal("0"), "quantity_out": Decimal("0")}
            balances[key]["quantity_in"] += Decimal(str(entry.quantity_in or 0))
            balances[key]["quantity_out"] += Decimal(str(entry.quantity_out or 0))

        items = []
        for product in products:
            for (product_id, location), amounts in balances.items():
                if product_id != product.id:
                    continue
                on_hand = amounts["quantity_in"] - amounts["quantity_out"]
                items.append({
                    "product_id": product.id,
                    "sku": product.sku,
                    "product_name": product.name,
                    "location": location,
                    "quantity_in": str(amounts["quantity_in"]),
                    "quantity_out": str(amounts["quantity_out"]),
                    "on_hand": str(on_hand)
                })
        return {"items": items, "total": len(items)}
    finally:
        db.close()


Base.metadata.create_all(bind=engine)

# ============================================================
# PRODUCTION: BOM AND WORK ORDERS
# ============================================================

class ProductionBOM(Base):
    __tablename__ = "production_boms"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    bom_no = Column(String(60), nullable=False)
    name = Column(String(200), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    output_quantity = Column(Numeric(14, 3), nullable=False, default=1)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ProductionBOMLine(Base):
    __tablename__ = "production_bom_lines"

    id = Column(Integer, primary_key=True, index=True)
    bom_id = Column(Integer, ForeignKey("production_boms.id"), nullable=False, index=True)
    material_product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity_per_output = Column(Numeric(14, 4), nullable=False)
    wastage_percent = Column(Numeric(7, 3), default=0, nullable=False)


class ProductionWorkOrder(Base):
    __tablename__ = "production_work_orders"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    bom_id = Column(Integer, ForeignKey("production_boms.id"), nullable=False)
    work_order_no = Column(String(60), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    planned_quantity = Column(Numeric(14, 3), nullable=False)
    produced_quantity = Column(Numeric(14, 3), default=0, nullable=False)
    planned_date = Column(String(20), nullable=True)
    due_date = Column(String(20), nullable=True)
    location = Column(String(150), nullable=False)
    status = Column(String(30), default="Draft", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)


class ProductionWorkOrderMaterial(Base):
    __tablename__ = "production_work_order_materials"

    id = Column(Integer, primary_key=True, index=True)
    work_order_id = Column(Integer, ForeignKey("production_work_orders.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity_per_output = Column(Numeric(14, 4), nullable=False)
    wastage_percent = Column(Numeric(7, 3), default=0, nullable=False)


class ProductionBOMLineInput(BaseModel):
    material_product_id: int
    quantity_per_output: Decimal
    wastage_percent: Decimal = Decimal("0")


class ProductionBOMInput(BaseModel):
    bom_no: str
    name: str
    product_id: int
    output_quantity: Decimal = Decimal("1")
    notes: str | None = None
    lines: list[ProductionBOMLineInput]


class ProductionWorkOrderInput(BaseModel):
    bom_id: int
    work_order_no: str
    planned_quantity: Decimal
    planned_date: str | None = None
    due_date: str | None = None
    location: str
    notes: str | None = None


class ProductionCompleteInput(BaseModel):
    produced_quantity: Decimal


def _production_bom_output(db, bom):
    product = db.query(Product).filter(Product.id == bom.product_id).first()
    lines = db.query(ProductionBOMLine).filter(
        ProductionBOMLine.bom_id == bom.id
    ).all()
    return {
        "id": bom.id,
        "company_id": bom.company_id,
        "bom_no": bom.bom_no,
        "name": bom.name,
        "product_id": bom.product_id,
        "product_name": product.name if product else "",
        "product_sku": product.sku if product else "",
        "output_quantity": str(bom.output_quantity),
        "notes": bom.notes,
        "is_active": bom.is_active,
        "lines": [{
            "id": line.id,
            "material_product_id": line.material_product_id,
            "material_name": (db.query(Product).filter(
                Product.id == line.material_product_id
            ).first().name),
            "quantity_per_output": str(line.quantity_per_output),
            "wastage_percent": str(line.wastage_percent)
        } for line in lines]
    }


def _production_order_output(db, order):
    product = db.query(Product).filter(Product.id == order.product_id).first()
    materials = db.query(ProductionWorkOrderMaterial).filter(
        ProductionWorkOrderMaterial.work_order_id == order.id
    ).all()
    bom = db.query(ProductionBOM).filter(
        ProductionBOM.id == order.bom_id
    ).first()
    return {
        "id": order.id,
        "work_order_no": order.work_order_no,
        "bom_id": order.bom_id,
        "bom_no": bom.bom_no if bom else "",
        "product_id": order.product_id,
        "product_name": product.name if product else "",
        "planned_quantity": str(order.planned_quantity),
        "produced_quantity": str(order.produced_quantity),
        "planned_date": order.planned_date,
        "due_date": order.due_date,
        "location": order.location,
        "status": order.status,
        "notes": order.notes,
        "materials": [{
            "product_id": m.product_id,
            "product_name": (db.query(Product).filter(
                Product.id == m.product_id
            ).first().name),
            "quantity_per_output": str(m.quantity_per_output),
            "wastage_percent": str(m.wastage_percent)
        } for m in materials]
    }


@app.get("/api/production/companies/{company_id}/boms")
def production_list_boms(company_id: int, context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ProductionBOM).filter(
            ProductionBOM.company_id == company_id
        ).order_by(ProductionBOM.id.desc()).all()
        return [_production_bom_output(db, row) for row in rows]
    finally:
        db.close()


@app.post("/api/production/companies/{company_id}/boms")
def production_create_bom(
    company_id: int,
    payload: ProductionBOMInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    if not payload.lines:
        raise HTTPException(400, "Add at least one raw material.")
    if payload.output_quantity <= 0:
        raise HTTPException(400, "BOM output quantity must be positive.")
    db = Session()
    try:
        finished = db.query(Product).filter(
            Product.id == payload.product_id,
            Product.company_id == company_id,
            Product.is_active == True
        ).first()
        if not finished:
            raise HTTPException(400, "Finished product not found.")
        if db.query(ProductionBOM).filter(
            ProductionBOM.company_id == company_id,
            ProductionBOM.bom_no == payload.bom_no
        ).first():
            raise HTTPException(409, "BOM number already exists.")
        bom = ProductionBOM(
            company_id=company_id,
            bom_no=payload.bom_no.strip(),
            name=payload.name.strip(),
            product_id=payload.product_id,
            output_quantity=payload.output_quantity,
            notes=payload.notes
        )
        db.add(bom)
        db.flush()
        for line in payload.lines:
            material = db.query(Product).filter(
                Product.id == line.material_product_id,
                Product.company_id == company_id,
                Product.is_active == True,
                Product.track_inventory == True
            ).first()
            if not material or material.id == finished.id:
                raise HTTPException(400, "Invalid raw material product.")
            if line.quantity_per_output <= 0 or line.wastage_percent < 0:
                raise HTTPException(400, "Material quantity must be positive and wastage cannot be negative.")
            db.add(ProductionBOMLine(
                bom_id=bom.id,
                material_product_id=line.material_product_id,
                quantity_per_output=line.quantity_per_output,
                wastage_percent=line.wastage_percent
            ))
        db.commit()
        db.refresh(bom)
        return _production_bom_output(db, bom)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.put("/api/production/boms/{bom_id}")
def production_update_bom(
    bom_id: int,
    payload: ProductionBOMInput,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        bom = db.query(ProductionBOM).filter(ProductionBOM.id == bom_id).first()
        if not bom:
            raise HTTPException(404, "BOM not found.")
        product_company_access(bom.company_id, context)
        if db.query(ProductionWorkOrder).filter(
            ProductionWorkOrder.bom_id == bom_id,
            ProductionWorkOrder.status != "Cancelled"
        ).first():
            raise HTTPException(409, "BOM is linked to a work order; create a new BOM revision instead.")
        if not payload.lines or payload.output_quantity <= 0:
            raise HTTPException(400, "BOM needs a positive output quantity and at least one material.")
        bom.bom_no = payload.bom_no.strip()
        bom.name = payload.name.strip()
        bom.product_id = payload.product_id
        bom.output_quantity = payload.output_quantity
        bom.notes = payload.notes
        db.query(ProductionBOMLine).filter(
            ProductionBOMLine.bom_id == bom_id
        ).delete()
        for line in payload.lines:
            material = db.query(Product).filter(
                Product.id == line.material_product_id,
                Product.company_id == bom.company_id,
                Product.is_active == True,
                Product.track_inventory == True
            ).first()
            if not material or material.id == payload.product_id or line.quantity_per_output <= 0 or line.wastage_percent < 0:
                raise HTTPException(400, "Invalid BOM material or quantity.")
            db.add(ProductionBOMLine(
                bom_id=bom_id,
                material_product_id=line.material_product_id,
                quantity_per_output=line.quantity_per_output,
                wastage_percent=line.wastage_percent
            ))
        db.commit()
        db.refresh(bom)
        return _production_bom_output(db, bom)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/production/companies/{company_id}/work-orders")
def production_list_work_orders(company_id: int, context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ProductionWorkOrder).filter(
            ProductionWorkOrder.company_id == company_id
        ).order_by(ProductionWorkOrder.id.desc()).all()
        return [_production_order_output(db, row) for row in rows]
    finally:
        db.close()


@app.post("/api/production/companies/{company_id}/work-orders")
def production_create_work_order(
    company_id: int,
    payload: ProductionWorkOrderInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    if payload.planned_quantity <= 0 or not payload.location.strip():
        raise HTTPException(400, "Enter a positive quantity and production stock location.")
    db = Session()
    try:
        bom = db.query(ProductionBOM).filter(
            ProductionBOM.id == payload.bom_id,
            ProductionBOM.company_id == company_id,
            ProductionBOM.is_active == True
        ).first()
        if not bom:
            raise HTTPException(404, "Active BOM not found.")
        order = ProductionWorkOrder(
            company_id=company_id,
            bom_id=bom.id,
            work_order_no=payload.work_order_no.strip(),
            product_id=bom.product_id,
            planned_quantity=payload.planned_quantity,
            planned_date=payload.planned_date,
            due_date=payload.due_date,
            location=payload.location.strip(),
            notes=payload.notes,
            status="Released"
        )
        if db.query(ProductionWorkOrder).filter(
            ProductionWorkOrder.company_id == company_id,
            ProductionWorkOrder.work_order_no == order.work_order_no
        ).first():
            raise HTTPException(409, "Work order number already exists.")
        db.add(order)
        db.flush()
        bom_lines = db.query(ProductionBOMLine).filter(
            ProductionBOMLine.bom_id == bom.id
        ).all()
        if not bom_lines:
            raise HTTPException(400, "BOM has no materials.")
        for line in bom_lines:
            db.add(ProductionWorkOrderMaterial(
                work_order_id=order.id,
                product_id=line.material_product_id,
                quantity_per_output=(
                    Decimal(str(line.quantity_per_output)) /
                    Decimal(str(bom.output_quantity))
                ),
                wastage_percent=line.wastage_percent
            ))
        db.commit()
        db.refresh(order)
        return _production_order_output(db, order)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/production/work-orders/{order_id}/complete")
def production_complete_work_order(
    order_id: int,
    payload: ProductionCompleteInput,
    context=Depends(erp_require("orders.manage"))
):
    if payload.produced_quantity <= 0:
        raise HTTPException(400, "Produced quantity must be positive.")
    db = Session()
    try:
        order = db.query(ProductionWorkOrder).filter(
            ProductionWorkOrder.id == order_id
        ).with_for_update().first()
        if not order:
            raise HTTPException(404, "Work order not found.")
        product_company_access(order.company_id, context)
        if order.status not in ["Released", "In Progress"]:
            raise HTTPException(409, "Work order is not available for completion.")
        if payload.produced_quantity > order.planned_quantity:
            raise HTTPException(400, "Produced quantity cannot exceed the planned quantity.")
        if payload.produced_quantity <= 0:
            raise HTTPException(400, "Produced quantity must be positive.")

        materials = db.query(ProductionWorkOrderMaterial).filter(
            ProductionWorkOrderMaterial.work_order_id == order.id
        ).all()
        required = []
        for material in materials:
            base_qty = Decimal(str(material.quantity_per_output)) * payload.produced_quantity
            qty = base_qty * (
                Decimal("1") + Decimal(str(material.wastage_percent)) / Decimal("100")
            )
            ledger = db.query(InventoryLedger).filter(
                InventoryLedger.company_id == order.company_id,
                InventoryLedger.product_id == material.product_id,
                InventoryLedger.location == order.location
            ).with_for_update().all()
            available = sum(
                (Decimal(str(x.quantity_in or 0)) - Decimal(str(x.quantity_out or 0)) for x in ledger),
                Decimal("0")
            )
            if available < qty:
                product = db.query(Product).filter(Product.id == material.product_id).first()
                raise HTTPException(
                    400,
                    f"Insufficient stock for {product.name if product else material.product_id} at {order.location}. Required {qty}; available {available}."
                )
            required.append((material, qty))

        for material, qty in required:
            db.add(InventoryLedger(
                company_id=order.company_id,
                product_id=material.product_id,
                transaction_type="Production Consumption",
                reference_type="WorkOrder",
                reference_id=order.id,
                reference_no=order.work_order_no,
                transaction_date=datetime.utcnow().date().isoformat(),
                quantity_in=Decimal("0"),
                quantity_out=qty,
                unit_cost=Decimal("0"),
                location=order.location
            ))

        finished_product = db.query(Product).filter(
            Product.id == order.product_id,
            Product.company_id == order.company_id
        ).first()
        db.add(InventoryLedger(
            company_id=order.company_id,
            product_id=order.product_id,
            transaction_type="Production Output",
            reference_type="WorkOrder",
            reference_id=order.id,
            reference_no=order.work_order_no,
            transaction_date=datetime.utcnow().date().isoformat(),
            quantity_in=payload.produced_quantity,
            quantity_out=Decimal("0"),
            unit_cost=Decimal(str(finished_product.purchase_price or 0)) if finished_product else Decimal("0"),
            location=order.location
        ))
        order.produced_quantity = payload.produced_quantity
        order.status = "Completed"
        order.posted_at = datetime.utcnow()
        db.commit()
        db.refresh(order)
        return _production_order_output(db, order)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


Base.metadata.create_all(bind=engine)

# ============================================================
# QUALITY CONTROL AND REJECTION MANAGEMENT
# ============================================================

class QCInspection(Base):
    __tablename__ = "qc_inspections"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    inspection_no = Column(String(60), nullable=False)
    inspection_type = Column(String(30), nullable=False)
    inspection_date = Column(String(20), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    goods_receipt_id = Column(Integer, ForeignKey("goods_receipts.id"), nullable=True)
    work_order_id = Column(Integer, ForeignKey("production_work_orders.id"), nullable=True)
    inspected_quantity = Column(Numeric(14, 3), nullable=False)
    accepted_quantity = Column(Numeric(14, 3), nullable=False)
    rejected_quantity = Column(Numeric(14, 3), nullable=False)
    rejection_reason = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)
    status = Column(String(30), default="Recorded", nullable=False)
    inspected_by = Column(String(150), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class QCInspectionInput(BaseModel):
    inspection_no: str
    inspection_type: str
    inspection_date: str
    product_id: int
    goods_receipt_id: int | None = None
    work_order_id: int | None = None
    inspected_quantity: Decimal
    accepted_quantity: Decimal
    rejected_quantity: Decimal
    rejection_reason: str | None = None
    corrective_action: str | None = None
    inspected_by: str | None = None
    notes: str | None = None


def _qc_output(db, row):
    product = db.query(Product).filter(Product.id == row.product_id).first()
    return {
        "id": row.id,
        "inspection_no": row.inspection_no,
        "inspection_type": row.inspection_type,
        "inspection_date": row.inspection_date,
        "product_id": row.product_id,
        "product_name": product.name if product else "",
        "product_sku": product.sku if product else "",
        "goods_receipt_id": row.goods_receipt_id,
        "work_order_id": row.work_order_id,
        "inspected_quantity": str(row.inspected_quantity),
        "accepted_quantity": str(row.accepted_quantity),
        "rejected_quantity": str(row.rejected_quantity),
        "rejection_reason": row.rejection_reason,
        "corrective_action": row.corrective_action,
        "status": row.status,
        "inspected_by": row.inspected_by,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None
    }


@app.get("/api/quality/companies/{company_id}/inspections")
def qc_list_inspections(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(QCInspection).filter(
            QCInspection.company_id == company_id
        ).order_by(QCInspection.id.desc()).all()
        return [_qc_output(db, row) for row in rows]
    finally:
        db.close()


@app.post("/api/quality/companies/{company_id}/inspections")
def qc_create_inspection(
    company_id: int,
    payload: QCInspectionInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)

    inspection_type = payload.inspection_type.strip().lower()
    if inspection_type not in ["incoming", "in-process", "finished-goods"]:
        raise HTTPException(400, "Inspection type must be Incoming, In-process or Finished-goods.")

    if payload.inspected_quantity <= 0:
        raise HTTPException(400, "Inspected quantity must be positive.")

    if payload.accepted_quantity < 0 or payload.rejected_quantity < 0:
        raise HTTPException(400, "Accepted and rejected quantities cannot be negative.")

    if payload.accepted_quantity + payload.rejected_quantity != payload.inspected_quantity:
        raise HTTPException(400, "Accepted quantity plus rejected quantity must equal inspected quantity.")

    if payload.rejected_quantity > 0 and not (payload.rejection_reason or "").strip():
        raise HTTPException(400, "Enter a rejection reason when rejected quantity is greater than zero.")

    if inspection_type == "incoming" and not payload.goods_receipt_id:
        raise HTTPException(400, "Select a Goods Receipt for incoming inspection.")

    if inspection_type in ["in-process", "finished-goods"] and not payload.work_order_id:
        raise HTTPException(400, "Select a Work Order for production inspection.")

    db = Session()
    try:
        product = db.query(Product).filter(
            Product.id == payload.product_id,
            Product.company_id == company_id,
            Product.is_active == True
        ).first()
        if not product:
            raise HTTPException(404, "Product not found or inactive.")

        if inspection_type == "incoming":
            receipt = db.query(GoodsReceipt).filter(
                GoodsReceipt.id == payload.goods_receipt_id,
                GoodsReceipt.company_id == company_id
            ).first()
            if not receipt:
                raise HTTPException(404, "Goods Receipt not found for this company.")
            receipt_line = db.query(GoodsReceiptLine).filter(
                GoodsReceiptLine.receipt_id == receipt.id,
                GoodsReceiptLine.product_id == payload.product_id
            ).first()
            if not receipt_line:
                raise HTTPException(400, "Selected product is not part of this Goods Receipt.")

        if inspection_type in ["in-process", "finished-goods"]:
            order = db.query(ProductionWorkOrder).filter(
                ProductionWorkOrder.id == payload.work_order_id,
                ProductionWorkOrder.company_id == company_id
            ).first()
            if not order:
                raise HTTPException(404, "Work Order not found for this company.")

            if inspection_type == "finished-goods" and order.product_id != payload.product_id:
                raise HTTPException(400, "Finished-goods inspection product must match the Work Order output.")

            if inspection_type == "in-process":
                material = db.query(ProductionWorkOrderMaterial).filter(
                    ProductionWorkOrderMaterial.work_order_id == order.id,
                    ProductionWorkOrderMaterial.product_id == payload.product_id
                ).first()
                if not material:
                    raise HTTPException(400, "Selected product is not a material in this Work Order.")

        if db.query(QCInspection).filter(
            QCInspection.company_id == company_id,
            QCInspection.inspection_no == payload.inspection_no.strip()
        ).first():
            raise HTTPException(409, "Inspection number already exists.")

        row = QCInspection(
            company_id=company_id,
            inspection_no=payload.inspection_no.strip(),
            inspection_type=inspection_type,
            inspection_date=payload.inspection_date,
            product_id=payload.product_id,
            goods_receipt_id=payload.goods_receipt_id if inspection_type == "incoming" else None,
            work_order_id=payload.work_order_id if inspection_type != "incoming" else None,
            inspected_quantity=payload.inspected_quantity,
            accepted_quantity=payload.accepted_quantity,
            rejected_quantity=payload.rejected_quantity,
            rejection_reason=payload.rejection_reason,
            corrective_action=payload.corrective_action,
            inspected_by=payload.inspected_by,
            notes=payload.notes,
            status="Recorded"
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _qc_output(db, row)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


Base.metadata.create_all(bind=engine)

# ============================================================
# DISPATCH & DELIVERY MANAGEMENT
# ============================================================

class Dispatch(Base):
    __tablename__ = "dispatches"
    __table_args__ = (
        UniqueConstraint("company_id", "dispatch_no", name="uq_dispatch_company_no"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False, index=True)
    dispatch_no = Column(String(60), nullable=False)
    dispatch_date = Column(String(20), nullable=False)
    location = Column(String(150), nullable=False)
    transporter = Column(String(150), nullable=True)
    vehicle_no = Column(String(60), nullable=True)
    tracking_no = Column(String(100), nullable=True)
    delivery_address = Column(Text, nullable=True)
    status = Column(String(20), default="Draft", nullable=False)
    delivery_status = Column(String(30), default="Pending", nullable=False)
    delivered_date = Column(String(20), nullable=True)
    received_by = Column(String(150), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    posted_at = Column(DateTime, nullable=True)


class DispatchLine(Base):
    __tablename__ = "dispatch_lines"

    id = Column(Integer, primary_key=True, index=True)
    dispatch_id = Column(Integer, ForeignKey("dispatches.id"), nullable=False, index=True)
    sales_order_line_id = Column(Integer, ForeignKey("sales_order_lines.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)
    description = Column(String(300), nullable=False)
    sku = Column(String(80), nullable=True)
    unit = Column(String(30), default="Nos", nullable=False)
    quantity = Column(Numeric(14, 3), nullable=False)


class DispatchLineInput(BaseModel):
    sales_order_line_id: int
    quantity: Decimal


class DispatchInput(BaseModel):
    sales_order_id: int
    dispatch_no: str
    dispatch_date: str
    location: str
    transporter: str | None = None
    vehicle_no: str | None = None
    tracking_no: str | None = None
    delivery_address: str | None = None
    notes: str | None = None
    lines: list[DispatchLineInput]


class DispatchDeliveryInput(BaseModel):
    delivery_status: str
    delivered_date: str | None = None
    received_by: str | None = None
    notes: str | None = None


def _dispatch_output(db, row):
    order = db.query(SalesOrder).filter(SalesOrder.id == row.sales_order_id).first()
    customer = db.query(Party).filter(Party.id == order.customer_id).first() if order else None
    lines = db.query(DispatchLine).filter(DispatchLine.dispatch_id == row.id).all()
    return {
        "id": row.id,
        "company_id": row.company_id,
        "sales_order_id": row.sales_order_id,
        "order_no": order.order_no if order else "",
        "customer_name": customer.name if customer else "",
        "dispatch_no": row.dispatch_no,
        "dispatch_date": row.dispatch_date,
        "location": row.location,
        "transporter": row.transporter,
        "vehicle_no": row.vehicle_no,
        "tracking_no": row.tracking_no,
        "delivery_address": row.delivery_address,
        "status": row.status,
        "delivery_status": row.delivery_status,
        "delivered_date": row.delivered_date,
        "received_by": row.received_by,
        "notes": row.notes,
        "posted_at": row.posted_at.isoformat() if row.posted_at else None,
        "lines": [
            {
                "id": line.id,
                "sales_order_line_id": line.sales_order_line_id,
                "product_id": line.product_id,
                "description": line.description,
                "sku": line.sku,
                "unit": line.unit,
                "quantity": float(line.quantity)
            } for line in lines
        ]
    }


@app.get("/api/dispatch/companies/{company_id}/orders")
def dispatch_available_orders(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        orders = db.query(SalesOrder).filter(
            SalesOrder.company_id == company_id,
            SalesOrder.status.notin_(["Cancelled", "Completed"])
        ).order_by(SalesOrder.id.desc()).all()

        result = []
        for order in orders:
            order_lines = db.query(SalesOrderLine).filter(
                SalesOrderLine.sales_order_id == order.id
            ).all()
            line_items = []
            for line in order_lines:
                posted = db.query(DispatchLine).join(
                    Dispatch, Dispatch.id == DispatchLine.dispatch_id
                ).filter(
                    Dispatch.sales_order_id == order.id,
                    DispatchLine.sales_order_line_id == line.id,
                    Dispatch.status == "Posted"
                ).all()
                dispatched = sum(
                    (Decimal(str(x.quantity)) for x in posted), Decimal("0")
                )
                pending = Decimal(str(line.quantity)) - dispatched
                line_items.append({
                    "id": line.id,
                    "product_id": line.product_id,
                    "sku": line.sku,
                    "description": line.description,
                    "unit": line.unit,
                    "quantity": float(line.quantity),
                    "dispatched_quantity": float(dispatched),
                    "pending_quantity": float(max(pending, Decimal("0")))
                })
            if any(x["pending_quantity"] > 0 for x in line_items):
                result.append({
                    "id": order.id,
                    "order_no": order.order_no,
                    "customer_id": order.customer_id,
                    "customer_name": (
                        db.query(Party.name).filter(Party.id == order.customer_id).scalar() or ""
                    ),
                    "order_date": order.order_date,
                    "promised_date": order.promised_date,
                    "status": order.status,
                    "lines": line_items
                })
        return result
    finally:
        db.close()


@app.get("/api/dispatch/companies/{company_id}/dispatches")
def dispatch_list(
    company_id: int,
    context=Depends(erp_require("orders.read"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(Dispatch).filter(
            Dispatch.company_id == company_id
        ).order_by(Dispatch.id.desc()).limit(1000).all()
        return [_dispatch_output(db, row) for row in rows]
    finally:
        db.close()


@app.post("/api/dispatch/companies/{company_id}/dispatches")
def dispatch_create(
    company_id: int,
    payload: DispatchInput,
    context=Depends(erp_require("orders.create"))
):
    product_company_access(company_id, context)
    db = Session()
    try:
        order = db.query(SalesOrder).filter(
            SalesOrder.id == payload.sales_order_id,
            SalesOrder.company_id == company_id
        ).first()
        if not order:
            raise HTTPException(404, "Sales order not found.")
        if order.status in ["Cancelled", "Completed"]:
            raise HTTPException(400, "This sales order cannot be dispatched.")

        dispatch_no = payload.dispatch_no.strip().upper()
        location = payload.location.strip()
        if not dispatch_no or not payload.dispatch_date.strip() or not location:
            raise HTTPException(400, "Dispatch number, date and stock location are required.")
        if not payload.lines:
            raise HTTPException(400, "Add at least one dispatch line.")

        seen = set()
        prepared = []
        for item in payload.lines:
            if item.sales_order_line_id in seen:
                raise HTTPException(400, "A sales order line can only appear once.")
            seen.add(item.sales_order_line_id)
            if item.quantity <= 0:
                raise HTTPException(400, "Dispatch quantities must be greater than zero.")

            order_line = db.query(SalesOrderLine).filter(
                SalesOrderLine.id == item.sales_order_line_id,
                SalesOrderLine.sales_order_id == order.id
            ).first()
            if not order_line:
                raise HTTPException(400, "A selected line does not belong to this sales order.")

            posted_lines = db.query(DispatchLine).join(
                Dispatch, Dispatch.id == DispatchLine.dispatch_id
            ).filter(
                Dispatch.sales_order_id == order.id,
                DispatchLine.sales_order_line_id == order_line.id,
                Dispatch.status == "Posted"
            ).all()
            already = sum(
                (Decimal(str(x.quantity)) for x in posted_lines), Decimal("0")
            )
            pending = Decimal(str(order_line.quantity)) - already
            if item.quantity > pending:
                raise HTTPException(
                    400,
                    f"Over-dispatch prevented for {order_line.description}. Pending quantity: {pending}."
                )
            prepared.append((order_line, item.quantity))

        row = Dispatch(
            company_id=company_id,
            sales_order_id=order.id,
            dispatch_no=dispatch_no,
            dispatch_date=payload.dispatch_date.strip(),
            location=location,
            transporter=payload.transporter,
            vehicle_no=payload.vehicle_no,
            tracking_no=payload.tracking_no,
            delivery_address=payload.delivery_address,
            notes=payload.notes,
            status="Draft",
            delivery_status="Pending"
        )
        db.add(row)
        db.flush()
        for order_line, qty in prepared:
            db.add(DispatchLine(
                dispatch_id=row.id,
                sales_order_line_id=order_line.id,
                product_id=order_line.product_id,
                description=order_line.description,
                sku=order_line.sku,
                unit=order_line.unit,
                quantity=qty
            ))
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise HTTPException(409, "Dispatch number already exists or dispatch data is invalid.")
        return _dispatch_output(db, row)
    finally:
        db.close()


@app.post("/api/dispatch/dispatches/{dispatch_id}/post")
def dispatch_post(
    dispatch_id: int,
    context=Depends(erp_require("orders.manage"))
):
    db = Session()
    try:
        row = db.query(Dispatch).filter(Dispatch.id == dispatch_id).first()
        if not row:
            raise HTTPException(404, "Dispatch not found.")
        product_company_access(row.company_id, context)
        if row.status == "Posted":
            raise HTTPException(409, "This dispatch has already been posted.")

        order = db.query(SalesOrder).filter(SalesOrder.id == row.sales_order_id).first()
        if not order or order.status == "Cancelled":
            raise HTTPException(400, "The linked sales order is unavailable or cancelled.")

        lines = db.query(DispatchLine).filter(DispatchLine.dispatch_id == row.id).all()
        if not lines:
            raise HTTPException(400, "This dispatch has no lines.")

        # Recheck pending order quantities at posting time.
        for line in lines:
            order_line = db.query(SalesOrderLine).filter(
                SalesOrderLine.id == line.sales_order_line_id
            ).first()
            if not order_line:
                raise HTTPException(400, "Sales order line no longer exists.")
            other_posted = db.query(DispatchLine).join(
                Dispatch, Dispatch.id == DispatchLine.dispatch_id
            ).filter(
                Dispatch.sales_order_id == order.id,
                DispatchLine.sales_order_line_id == order_line.id,
                Dispatch.status == "Posted",
                Dispatch.id != row.id
            ).all()
            already = sum(
                (Decimal(str(x.quantity)) for x in other_posted), Decimal("0")
            )
            if already + Decimal(str(line.quantity)) > Decimal(str(order_line.quantity)):
                raise HTTPException(409, f"Pending quantity changed for {line.description}. Refresh and revise the dispatch.")

            if not line.product_id:
                raise HTTPException(400, f"{line.description} has no inventory product linked.")

            product = db.query(Product).filter(
                Product.id == line.product_id,
                Product.company_id == row.company_id
            ).first()
            if not product:
                raise HTTPException(400, f"Product for {line.description} is not available in this company.")
            if product.track_inventory:
                ledger_rows = db.query(InventoryLedger).filter(
                    InventoryLedger.company_id == row.company_id,
                    InventoryLedger.product_id == line.product_id,
                    InventoryLedger.location == row.location
                ).all()
                available = sum(
                    (
                        Decimal(str(x.quantity_in or 0)) -
                        Decimal(str(x.quantity_out or 0))
                        for x in ledger_rows
                    ),
                    Decimal("0")
                )
                if available < Decimal(str(line.quantity)):
                    raise HTTPException(
                        400,
                        f"Insufficient stock for {line.description} at {row.location}. Required {line.quantity}; available {available}."
                    )

        for line in lines:
            product = db.query(Product).filter(Product.id == line.product_id).first()
            if product and product.track_inventory:
                db.add(InventoryLedger(
                    company_id=row.company_id,
                    product_id=line.product_id,
                    transaction_type="Sales Dispatch",
                    reference_type="Dispatch",
                    reference_id=row.id,
                    reference_no=row.dispatch_no,
                    transaction_date=row.dispatch_date,
                    quantity_in=Decimal("0"),
                    quantity_out=Decimal(str(line.quantity)),
                    unit_cost=Decimal(str(product.purchase_price or 0)),
                    location=row.location
                ))

        row.status = "Posted"
        row.posted_at = datetime.utcnow()

        # Mark order dispatched only when every order line is fully delivered.
        all_order_lines = db.query(SalesOrderLine).filter(
            SalesOrderLine.sales_order_id == order.id
        ).all()
        all_complete = True
        for order_line in all_order_lines:
            posted = db.query(DispatchLine).join(
                Dispatch, Dispatch.id == DispatchLine.dispatch_id
            ).filter(
                Dispatch.sales_order_id == order.id,
                DispatchLine.sales_order_line_id == order_line.id,
                Dispatch.status == "Posted"
            ).all()
            qty = sum(
                (Decimal(str(x.quantity)) for x in posted), Decimal("0")
            )
            if qty < Decimal(str(order_line.quantity)):
                all_complete = False
                break
        order.status = "Dispatched" if all_complete else "Ready for Dispatch"
        order.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _dispatch_output(db, row)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Unable to post dispatch. No inventory changes were saved.")
    finally:
        db.close()


@app.patch("/api/dispatch/dispatches/{dispatch_id}/delivery")
def dispatch_update_delivery(
    dispatch_id: int,
    payload: DispatchDeliveryInput,
    context=Depends(erp_require("orders.manage"))
):
    allowed = ["Pending", "In Transit", "Delivered", "Delivery Failed", "Returned"]
    if payload.delivery_status not in allowed:
        raise HTTPException(400, "Invalid delivery status.")
    db = Session()
    try:
        row = db.query(Dispatch).filter(Dispatch.id == dispatch_id).first()
        if not row:
            raise HTTPException(404, "Dispatch not found.")
        product_company_access(row.company_id, context)
        if row.status != "Posted":
            raise HTTPException(400, "Post the dispatch before updating delivery status.")
        row.delivery_status = payload.delivery_status
        row.delivered_date = payload.delivered_date
        row.received_by = payload.received_by
        if payload.notes:
            row.notes = ((row.notes or "") + "\n" + payload.notes).strip()
        db.commit()
        db.refresh(row)
        return _dispatch_output(db, row)
    finally:
        db.close()


Base.metadata.create_all(bind=engine)



# ================= FINANCE MODULE =================

from decimal import Decimal as _FinanceDecimal

class FinanceTaxProfile(Base):
    __tablename__ = "finance_tax_profiles"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), unique=True, nullable=False, index=True)
    legal_name = Column(String(200), nullable=True)
    gstin = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    state_code = Column(String(5), nullable=True)
    postal_code = Column(String(20), nullable=True)
    phone = Column(String(40), nullable=True)
    email = Column(String(200), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FinanceInvoice(Base):
    __tablename__ = "finance_invoices"
    __table_args__ = (
        UniqueConstraint("company_id", "invoice_no", name="uq_finance_invoice_number"),
        UniqueConstraint("sales_order_id", name="uq_finance_invoice_sales_order"),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("parties.id"), nullable=False, index=True)
    sales_order_id = Column(Integer, ForeignKey("sales_orders.id"), nullable=False, unique=True)
    invoice_no = Column(String(60), nullable=False)
    invoice_date = Column(String(20), nullable=False)
    due_date = Column(String(20), nullable=True)
    place_of_supply = Column(String(100), nullable=True)
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)
    taxable_total = Column(Numeric(14, 2), default=0, nullable=False)
    cgst_total = Column(Numeric(14, 2), default=0, nullable=False)
    sgst_total = Column(Numeric(14, 2), default=0, nullable=False)
    igst_total = Column(Numeric(14, 2), default=0, nullable=False)
    grand_total = Column(Numeric(14, 2), default=0, nullable=False)
    paid_amount = Column(Numeric(14, 2), default=0, nullable=False)
    balance_due = Column(Numeric(14, 2), default=0, nullable=False)
    status = Column(String(30), default="Draft", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FinanceInvoiceLine(Base):
    __tablename__ = "finance_invoice_lines"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("finance_invoices.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    sku = Column(String(80), nullable=True)
    description = Column(String(300), nullable=False)
    unit = Column(String(30), default="Nos", nullable=False)
    quantity = Column(Numeric(14, 3), nullable=False)
    unit_price = Column(Numeric(14, 2), nullable=False)
    taxable_amount = Column(Numeric(14, 2), nullable=False)
    tax_rate = Column(Numeric(7, 4), default=0, nullable=False)
    cgst_amount = Column(Numeric(14, 2), default=0, nullable=False)
    sgst_amount = Column(Numeric(14, 2), default=0, nullable=False)
    igst_amount = Column(Numeric(14, 2), default=0, nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False)

class FinancePayment(Base):
    __tablename__ = "finance_payments"
    __table_args__ = (
        UniqueConstraint("company_id", "receipt_no", name="uq_finance_receipt_number"),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    invoice_id = Column(Integer, ForeignKey("finance_invoices.id"), nullable=False, index=True)
    receipt_no = Column(String(60), nullable=False)
    payment_date = Column(String(20), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_mode = Column(String(40), nullable=False)
    reference_no = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class FinanceTaxProfileInput(BaseModel):
    legal_name: str | None = None
    gstin: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    postal_code: str | None = None
    phone: str | None = None
    email: str | None = None

class FinanceInvoiceInput(BaseModel):
    customer_id: int
    sales_order_id: int
    invoice_date: str
    due_date: str | None = None
    place_of_supply: str | None = None
    notes: str | None = None

class FinancePaymentInput(BaseModel):
    invoice_id: int
    payment_date: str
    amount: Decimal
    payment_mode: str
    reference_no: str | None = None
    notes: str | None = None

def _finance_profile_output(row):
    if not row:
        return None
    return {
        "id": row.id, "company_id": row.company_id,
        "legal_name": row.legal_name, "gstin": row.gstin,
        "address": row.address, "city": row.city, "state": row.state,
        "state_code": row.state_code, "postal_code": row.postal_code,
        "phone": row.phone, "email": row.email,
    }

def _finance_invoice_output(db, row):
    customer = db.query(Party).filter(Party.id == row.customer_id).first()
    order = db.query(SalesOrder).filter(SalesOrder.id == row.sales_order_id).first()
    profile = db.query(FinanceTaxProfile).filter(
        FinanceTaxProfile.company_id == row.company_id
    ).first()
    lines = db.query(FinanceInvoiceLine).filter(
        FinanceInvoiceLine.invoice_id == row.id
    ).all()
    return {
        "id": row.id, "company_id": row.company_id,
        "invoice_no": row.invoice_no, "customer_id": row.customer_id,
        "customer_name": customer.name if customer else "",
        "customer_gstin": customer.tax_id if customer else "",
        "sales_order_id": row.sales_order_id,
        "order_no": order.order_no if order else "",
        "invoice_date": row.invoice_date, "due_date": row.due_date,
        "place_of_supply": row.place_of_supply,
        "company_legal_name": profile.legal_name if profile else "",
        "company_gstin": profile.gstin if profile else "",
        "company_address": profile.address if profile else "",
        "company_state": profile.state if profile else "",
        "subtotal": float(row.subtotal or 0),
        "taxable_total": float(row.taxable_total or 0),
        "cgst_total": float(row.cgst_total or 0),
        "sgst_total": float(row.sgst_total or 0),
        "igst_total": float(row.igst_total or 0),
        "grand_total": float(row.grand_total or 0),
        "paid_amount": float(row.paid_amount or 0),
        "balance_due": float(row.balance_due or 0),
        "status": row.status, "notes": row.notes,
        "lines": [{
            "id": line.id, "product_id": line.product_id,
            "sku": line.sku, "description": line.description,
            "unit": line.unit, "quantity": float(line.quantity or 0),
            "unit_price": float(line.unit_price or 0),
            "taxable_amount": float(line.taxable_amount or 0),
            "tax_rate": float(line.tax_rate or 0),
            "cgst_amount": float(line.cgst_amount or 0),
            "sgst_amount": float(line.sgst_amount or 0),
            "igst_amount": float(line.igst_amount or 0),
            "tax_amount": float((line.cgst_amount or 0) + (line.sgst_amount or 0) + (line.igst_amount or 0)),
            "line_total": float(line.line_total or 0),
        } for line in lines],
    }

def _finance_payment_output(db, row):
    invoice = db.query(FinanceInvoice).filter(
        FinanceInvoice.id == row.invoice_id
    ).first()
    customer = db.query(Party).filter(
        Party.id == invoice.customer_id
    ).first() if invoice else None
    return {
        "id": row.id, "receipt_no": row.receipt_no,
        "invoice_id": row.invoice_id,
        "invoice_no": invoice.invoice_no if invoice else "",
        "customer_name": customer.name if customer else "",
        "payment_date": row.payment_date,
        "amount": float(row.amount or 0),
        "payment_mode": row.payment_mode,
        "reference_no": row.reference_no, "notes": row.notes,
    }

@app.get("/api/finance/companies/{company_id}/tax-profile")
def finance_get_tax_profile(company_id: int, context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        row = db.query(FinanceTaxProfile).filter(
            FinanceTaxProfile.company_id == company_id
        ).first()
        return _finance_profile_output(row) or {}
    finally:
        db.close()

@app.put("/api/finance/companies/{company_id}/tax-profile")
def finance_save_tax_profile(company_id: int, payload: FinanceTaxProfileInput,
                             context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        row = db.query(FinanceTaxProfile).filter(
            FinanceTaxProfile.company_id == company_id
        ).first()
        if not row:
            row = FinanceTaxProfile(company_id=company_id)
            db.add(row)
        for key, value in payload.dict(exclude_unset=True).items():
            setattr(row, key, value.strip() if isinstance(value, str) else value)
        db.commit()
        db.refresh(row)
        return _finance_profile_output(row)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.get("/api/finance/companies/{company_id}/invoices")
def finance_list_invoices(company_id: int, context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(FinanceInvoice).filter(
            FinanceInvoice.company_id == company_id
        ).order_by(FinanceInvoice.id.desc()).all()
        return {"items": [_finance_invoice_output(db, row) for row in rows],
                "total": len(rows)}
    finally:
        db.close()

@app.post("/api/finance/companies/{company_id}/invoices")
def finance_create_invoice(company_id: int, payload: FinanceInvoiceInput,
                           context=Depends(erp_require("orders.create"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        order = db.query(SalesOrder).filter(
            SalesOrder.id == payload.sales_order_id,
            SalesOrder.company_id == company_id
        ).first()
        if not order:
            raise HTTPException(404, "Sales order not found for this company.")
        if order.customer_id != payload.customer_id:
            raise HTTPException(400, "Selected customer does not match the sales order.")
        customer = db.query(Party).filter(
            Party.id == payload.customer_id,
            Party.company_id == company_id,
            Party.party_type == "customer"
        ).first()
        if not customer:
            raise HTTPException(404, "Customer not found.")
        if db.query(FinanceInvoice).filter(
            FinanceInvoice.sales_order_id == order.id
        ).first():
            raise HTTPException(409, "An invoice already exists for this sales order.")
        order_lines = db.query(SalesOrderLine).filter(
            SalesOrderLine.sales_order_id == order.id
        ).all()
        if not order_lines:
            raise HTTPException(400, "Sales order has no lines.")
        profile = db.query(FinanceTaxProfile).filter(
            FinanceTaxProfile.company_id == company_id
        ).first()
        same_state = bool(
            profile and profile.state and payload.place_of_supply and
            profile.state.strip().casefold() == payload.place_of_supply.strip().casefold()
        )
        year = (payload.invoice_date or datetime.utcnow().strftime("%Y-%m-%d"))[:4]
        count = db.query(FinanceInvoice).filter(
            FinanceInvoice.company_id == company_id
        ).count() + 1
        invoice_no = f"INV-{year}-{count:05d}"
        invoice = FinanceInvoice(
            company_id=company_id, customer_id=customer.id,
            sales_order_id=order.id, invoice_no=invoice_no,
            invoice_date=payload.invoice_date, due_date=payload.due_date,
            place_of_supply=payload.place_of_supply, notes=payload.notes,
            status="Draft"
        )
        db.add(invoice)
        db.flush()
        subtotal = Decimal("0")
        taxable_total = Decimal("0")
        cgst_total = Decimal("0")
        sgst_total = Decimal("0")
        igst_total = Decimal("0")
        grand_total = Decimal("0")
        for source in order_lines:
            taxable = Decimal(str(source.taxable_amount or 0)).quantize(Decimal("0.01"))
            tax = Decimal(str(source.tax_amount or 0)).quantize(Decimal("0.01"))
            total = Decimal(str(source.line_total or 0)).quantize(Decimal("0.01"))
            cgst = (tax / 2).quantize(Decimal("0.01")) if same_state else Decimal("0")
            sgst = (tax - cgst).quantize(Decimal("0.01")) if same_state else Decimal("0")
            igst = Decimal("0") if same_state else tax
            db.add(FinanceInvoiceLine(
                invoice_id=invoice.id, product_id=source.product_id,
                sku=source.sku, description=source.description,
                unit=source.unit, quantity=source.quantity,
                unit_price=source.unit_price, taxable_amount=taxable,
                tax_rate=source.tax_rate, cgst_amount=cgst,
                sgst_amount=sgst, igst_amount=igst, line_total=total
            ))
            subtotal += Decimal(str(source.line_subtotal or 0))
            taxable_total += taxable
            cgst_total += cgst
            sgst_total += sgst
            igst_total += igst
            grand_total += total
        invoice.subtotal = subtotal.quantize(Decimal("0.01"))
        invoice.taxable_total = taxable_total.quantize(Decimal("0.01"))
        invoice.cgst_total = cgst_total.quantize(Decimal("0.01"))
        invoice.sgst_total = sgst_total.quantize(Decimal("0.01"))
        invoice.igst_total = igst_total.quantize(Decimal("0.01"))
        invoice.grand_total = grand_total.quantize(Decimal("0.01"))
        invoice.balance_due = invoice.grand_total
        db.commit()
        db.refresh(invoice)
        return _finance_invoice_output(db, invoice)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.patch("/api/finance/invoices/{invoice_id}/issue")
def finance_issue_invoice(invoice_id: int, context=Depends(erp_require("orders.manage"))):
    db = Session()
    try:
        invoice = db.query(FinanceInvoice).filter(
            FinanceInvoice.id == invoice_id
        ).first()
        if not invoice:
            raise HTTPException(404, "Invoice not found.")
        product_company_access(invoice.company_id, context)
        if invoice.status != "Draft":
            raise HTTPException(400, "Only draft invoices can be issued.")
        invoice.status = "Issued"
        db.commit()
        db.refresh(invoice)
        return _finance_invoice_output(db, invoice)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@app.get("/api/finance/companies/{company_id}/payments")
def finance_list_payments(company_id: int, context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(FinancePayment).filter(
            FinancePayment.company_id == company_id
        ).order_by(FinancePayment.id.desc()).all()
        return {"items": [_finance_payment_output(db, row) for row in rows],
                "total": len(rows)}
    finally:
        db.close()

@app.post("/api/finance/companies/{company_id}/payments")
def finance_create_payment(company_id: int, payload: FinancePaymentInput,
                           context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        invoice = db.query(FinanceInvoice).filter(
            FinanceInvoice.id == payload.invoice_id,
            FinanceInvoice.company_id == company_id
        ).first()
        if not invoice:
            raise HTTPException(404, "Invoice not found.")
        if invoice.status not in ["Issued", "Partially Paid"]:
            raise HTTPException(400, "Only issued invoices can receive payments.")
        amount = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
        if amount <= 0:
            raise HTTPException(400, "Payment amount must be greater than zero.")
        balance = Decimal(str(invoice.balance_due or 0))
        if amount > balance:
            raise HTTPException(400, "Payment exceeds the invoice balance due.")
        count = db.query(FinancePayment).filter(
            FinancePayment.company_id == company_id
        ).count() + 1
        receipt_no = f"RCP-{datetime.utcnow().strftime('%Y')}-{count:05d}"
        payment = FinancePayment(
            company_id=company_id, invoice_id=invoice.id,
            receipt_no=receipt_no, payment_date=payload.payment_date,
            amount=amount, payment_mode=payload.payment_mode,
            reference_no=payload.reference_no, notes=payload.notes
        )
        db.add(payment)
        invoice.paid_amount = Decimal(str(invoice.paid_amount or 0)) + amount
        invoice.balance_due = balance - amount
        invoice.status = "Paid" if invoice.balance_due == 0 else "Partially Paid"
        db.commit()
        db.refresh(payment)
        return _finance_payment_output(db, payment)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

Base.metadata.create_all(bind=engine)


# ================= FINANCE CUSTOMER LEDGER =================

@app.get("/api/finance/companies/{company_id}/customer-ledger")
def finance_customer_ledger(
    company_id: int,
    customer_id: int | None = None,
    context=Depends(erp_require("orders.read")),
):
    product_company_access(company_id, context)
    db = Session()
    try:
        today = date.today()
        query = db.query(FinanceInvoice).filter(
            FinanceInvoice.company_id == company_id
        )
        if customer_id is not None:
            query = query.filter(FinanceInvoice.customer_id == customer_id)

        invoices = query.order_by(
            FinanceInvoice.invoice_date.desc(), FinanceInvoice.id.desc()
        ).all()

        result = []
        buckets = {
            "current": 0.0, "days_1_30": 0.0, "days_31_60": 0.0,
            "days_61_90": 0.0, "days_90_plus": 0.0
        }
        total_invoiced = total_paid = total_outstanding = 0.0

        for invoice in invoices:
            customer = db.query(Party).filter(
                Party.id == invoice.customer_id,
                Party.company_id == company_id
            ).first()

            payments = db.query(FinancePayment).filter(
                FinancePayment.invoice_id == invoice.id,
                FinancePayment.company_id == company_id
            ).order_by(FinancePayment.payment_date.asc()).all()

            balance = float(invoice.balance or 0)
            age = max(0, (today - invoice.due_date).days) if invoice.due_date else 0

            bucket = (
                "Current" if age == 0 or balance <= 0 else
                "1-30 days" if age <= 30 else
                "31-60 days" if age <= 60 else
                "61-90 days" if age <= 90 else "90+ days"
            )

            total_invoiced += float(invoice.grand_total or 0)
            total_paid += float(invoice.paid or 0)
            total_outstanding += balance

            if balance > 0:
                key = (
                    "current" if age == 0 else
                    "days_1_30" if age <= 30 else
                    "days_31_60" if age <= 60 else
                    "days_61_90" if age <= 90 else "days_90_plus"
                )
                buckets[key] += balance

            result.append({
                "invoice_id": invoice.id,
                "invoice_no": invoice.invoice_no,
                "customer_id": invoice.customer_id,
                "customer_name": customer.name if customer else "",
                "invoice_date": str(invoice.invoice_date),
                "due_date": str(invoice.due_date) if invoice.due_date else None,
                "grand_total": float(invoice.grand_total or 0),
                "paid": float(invoice.paid or 0),
                "balance": balance,
                "status": invoice.status,
                "overdue_days": age,
                "ageing_bucket": bucket,
                "payments": [{
                    "receipt_no": payment.receipt_no,
                    "payment_date": str(payment.payment_date),
                    "amount": float(payment.amount or 0),
                    "payment_mode": payment.payment_mode,
                    "reference_no": payment.reference_no
                } for payment in payments]
            })

        return {
            "items": result,
            "summary": {
                "total_invoiced": round(total_invoiced, 2),
                "total_paid": round(total_paid, 2),
                "total_outstanding": round(total_outstanding, 2),
                **{key: round(value, 2) for key, value in buckets.items()}
            },
            "as_of_date": str(today)
        }
    finally:
        db.close()

# ================= EXPENSES AND CASH BANK MODULE =================


# ================= EXPENSES AND CASH BANK MODULE =================

class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_expense_category_company"),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CashBankAccount(Base):
    __tablename__ = "cash_bank_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "account_code", name="uq_cash_bank_account_code"),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    account_code = Column(String(50), nullable=False)
    account_name = Column(String(160), nullable=False)
    account_type = Column(String(20), nullable=False)
    bank_name = Column(String(160))
    account_number = Column(String(80))
    opening_balance = Column(Numeric(14, 2), default=0, nullable=False)
    current_balance = Column(Numeric(14, 2), default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ExpenseVoucher(Base):
    __tablename__ = "expense_vouchers"
    __table_args__ = (
        UniqueConstraint("company_id", "voucher_no", name="uq_expense_voucher_number"),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("cash_bank_accounts.id"), nullable=True)
    voucher_no = Column(String(60), nullable=False)
    expense_date = Column(String(20), nullable=False)
    payee = Column(String(180), nullable=False)
    description = Column(Text)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_status = Column(String(20), default="Unpaid", nullable=False)
    status = Column(String(20), default="Draft", nullable=False)
    reference_no = Column(String(100))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CashBankTransaction(Base):
    __tablename__ = "cash_bank_transactions"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("cash_bank_accounts.id"), nullable=False, index=True)
    transaction_type = Column(String(20), nullable=False)
    transaction_date = Column(String(20), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    reference_no = Column(String(100))
    description = Column(Text)
    transfer_group = Column(String(60), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


Base.metadata.create_all(bind=engine)


def _cash_account_output(row):
    return {
        "id": row.id, "company_id": row.company_id,
        "account_code": row.account_code, "account_name": row.account_name,
        "account_type": row.account_type, "bank_name": row.bank_name,
        "account_number": row.account_number,
        "opening_balance": float(row.opening_balance or 0),
        "current_balance": float(row.current_balance or 0),
        "is_active": row.is_active
    }


def _expense_output(row, db):
    category = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == row.category_id
    ).first()
    account = db.query(CashBankAccount).filter(
        CashBankAccount.id == row.account_id
    ).first() if row.account_id else None
    return {
        "id": row.id, "company_id": row.company_id,
        "voucher_no": row.voucher_no, "expense_date": row.expense_date,
        "category_id": row.category_id,
        "category_name": category.name if category else None,
        "payee": row.payee, "description": row.description,
        "amount": float(row.amount or 0), "status": row.status,
        "payment_status": row.payment_status,
        "account_id": row.account_id,
        "account_name": account.account_name if account else None,
        "reference_no": row.reference_no, "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None
    }


@app.get("/api/finance/companies/{company_id}/expense-categories")
def finance_list_expense_categories(company_id: int,
        context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ExpenseCategory).filter(
            ExpenseCategory.company_id == company_id
        ).order_by(ExpenseCategory.name).all()
        return {"items": [{
            "id": r.id, "name": r.name, "description": r.description,
            "is_active": r.is_active
        } for r in rows]}
    finally:
        db.close()


@app.post("/api/finance/companies/{company_id}/expense-categories")
def finance_create_expense_category(company_id: int, payload: dict,
        context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(400, "Category name is required.")
    db = Session()
    try:
        row = ExpenseCategory(company_id=company_id, name=name,
            description=payload.get("description"))
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "name": row.name, "description": row.description}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/finance/companies/{company_id}/cash-bank-accounts")
def finance_list_cash_bank_accounts(company_id: int,
        context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(CashBankAccount).filter(
            CashBankAccount.company_id == company_id
        ).order_by(CashBankAccount.account_name).all()
        return {"items": [_cash_account_output(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/finance/companies/{company_id}/cash-bank-accounts")
def finance_create_cash_bank_account(company_id: int, payload: dict,
        context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    name = str(payload.get("account_name", "")).strip()
    code = str(payload.get("account_code", "")).strip()
    kind = str(payload.get("account_type", "")).strip().lower()
    if not name or not code:
        raise HTTPException(400, "Account name and code are required.")
    if kind not in ("cash", "bank"):
        raise HTTPException(400, "Account type must be cash or bank.")
    opening = Decimal(str(payload.get("opening_balance", 0))).quantize(Decimal("0.01"))
    if opening < 0:
        raise HTTPException(400, "Opening balance cannot be negative.")
    db = Session()
    try:
        row = CashBankAccount(
            company_id=company_id, account_code=code, account_name=name,
            account_type=kind, bank_name=payload.get("bank_name"),
            account_number=payload.get("account_number"),
            opening_balance=opening, current_balance=opening
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _cash_account_output(row)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/finance/companies/{company_id}/expenses")
def finance_list_expenses(company_id: int,
        context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ExpenseVoucher).filter(
            ExpenseVoucher.company_id == company_id
        ).order_by(ExpenseVoucher.id.desc()).all()
        return {"items": [_expense_output(r, db) for r in rows],
                "total": len(rows)}
    finally:
        db.close()


@app.post("/api/finance/companies/{company_id}/expenses")
def finance_create_expense(company_id: int, payload: dict,
        context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    try:
        amount = Decimal(str(payload.get("amount", 0))).quantize(Decimal("0.01"))
    except Exception:
        raise HTTPException(400, "Enter a valid expense amount.")
    if amount <= 0:
        raise HTTPException(400, "Expense amount must be greater than zero.")
    payee = str(payload.get("payee", "")).strip()
    expense_date = str(payload.get("expense_date", "")).strip()
    if not payee or not expense_date or not payload.get("category_id"):
        raise HTTPException(400, "Date, category and payee are required.")
    db = Session()
    try:
        category = db.query(ExpenseCategory).filter(
            ExpenseCategory.id == int(payload["category_id"]),
            ExpenseCategory.company_id == company_id,
            ExpenseCategory.is_active == True
        ).first()
        if not category:
            raise HTTPException(404, "Active expense category not found.")
        count = db.query(ExpenseVoucher).filter(
            ExpenseVoucher.company_id == company_id
        ).count() + 1
        row = ExpenseVoucher(
            company_id=company_id, category_id=category.id,
            voucher_no=f"EXP-{datetime.utcnow().strftime('%Y')}-{count:05d}",
            expense_date=expense_date, payee=payee,
            description=payload.get("description"), amount=amount,
            reference_no=payload.get("reference_no"), notes=payload.get("notes")
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _expense_output(row, db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/finance/expenses/{expense_id}/approve")
def finance_approve_expense(expense_id: int,
        context=Depends(erp_require("orders.manage"))):
    db = Session()
    try:
        row = db.query(ExpenseVoucher).filter(
            ExpenseVoucher.id == expense_id
        ).first()
        if not row:
            raise HTTPException(404, "Expense voucher not found.")
        product_company_access(row.company_id, context)
        if row.status != "Draft":
            raise HTTPException(400, "Only draft expenses can be approved.")
        row.status = "Approved"
        db.commit()
        db.refresh(row)
        return _expense_output(row, db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.patch("/api/finance/expenses/{expense_id}/pay")
def finance_pay_expense(expense_id: int, payload: dict,
        context=Depends(erp_require("orders.manage"))):
    db = Session()
    try:
        row = db.query(ExpenseVoucher).filter(
            ExpenseVoucher.id == expense_id
        ).first()
        if not row:
            raise HTTPException(404, "Expense voucher not found.")
        product_company_access(row.company_id, context)
        if row.status != "Approved" or row.payment_status != "Unpaid":
            raise HTTPException(400, "Only approved, unpaid expenses can be paid.")
        account = db.query(CashBankAccount).filter(
            CashBankAccount.id == int(payload.get("account_id", 0)),
            CashBankAccount.company_id == row.company_id,
            CashBankAccount.is_active == True
        ).first()
        if not account:
            raise HTTPException(404, "Active cash/bank account not found.")
        amount = Decimal(str(row.amount))
        balance = Decimal(str(account.current_balance or 0))
        if amount > balance:
            raise HTTPException(400, "Insufficient account balance.")
        account.current_balance = balance - amount
        row.account_id = account.id
        row.payment_status = "Paid"
        db.add(CashBankTransaction(
            company_id=row.company_id, account_id=account.id,
            transaction_type="payment", transaction_date=row.expense_date,
            amount=amount, reference_no=row.voucher_no,
            description=f"Expense payment: {row.payee}"
        ))
        db.commit()
        db.refresh(row)
        return _expense_output(row, db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.post("/api/finance/companies/{company_id}/cash-bank-transactions")
def finance_create_cash_bank_transaction(company_id: int, payload: dict,
        context=Depends(erp_require("orders.manage"))):
    product_company_access(company_id, context)
    kind = str(payload.get("transaction_type", "")).lower()
    if kind not in ("receipt", "payment", "transfer"):
        raise HTTPException(400, "Transaction type must be receipt, payment or transfer.")
    try:
        amount = Decimal(str(payload.get("amount", 0))).quantize(Decimal("0.01"))
    except Exception:
        raise HTTPException(400, "Enter a valid transaction amount.")
    if amount <= 0:
        raise HTTPException(400, "Transaction amount must be greater than zero.")
    db = Session()
    try:
        source = db.query(CashBankAccount).filter(
            CashBankAccount.id == int(payload.get("account_id", 0)),
            CashBankAccount.company_id == company_id,
            CashBankAccount.is_active == True
        ).first()
        if not source:
            raise HTTPException(404, "Active account not found.")
        target = None
        if kind == "transfer":
            target = db.query(CashBankAccount).filter(
                CashBankAccount.id == int(payload.get("to_account_id", 0)),
                CashBankAccount.company_id == company_id,
                CashBankAccount.is_active == True
            ).first()
            if not target or target.id == source.id:
                raise HTTPException(400, "Choose a different destination account.")
        if kind in ("payment", "transfer"):
            balance = Decimal(str(source.current_balance or 0))
            if amount > balance:
                raise HTTPException(400, "Insufficient account balance.")
            source.current_balance = balance - amount
        if kind == "receipt":
            source.current_balance = Decimal(str(source.current_balance or 0)) + amount
        group = f"TRF-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}" if target else None
        date_value = str(payload.get("transaction_date", "")).strip()
        if not date_value:
            raise HTTPException(400, "Transaction date is required.")
        description = payload.get("description")
        db.add(CashBankTransaction(
            company_id=company_id, account_id=source.id,
            transaction_type="payment" if kind == "transfer" else kind,
            transaction_date=date_value, amount=amount,
            reference_no=payload.get("reference_no"),
            description=description, transfer_group=group
        ))
        if target:
            target.current_balance = Decimal(str(target.current_balance or 0)) + amount
            db.add(CashBankTransaction(
                company_id=company_id, account_id=target.id,
                transaction_type="receipt", transaction_date=date_value,
                amount=amount, reference_no=payload.get("reference_no"),
                description=description or "Account transfer received",
                transfer_group=group
            ))
        db.commit()
        return {"message": "Transaction posted successfully.",
                "transaction_type": kind, "amount": float(amount),
                "source_account": _cash_account_output(source),
                "destination_account": _cash_account_output(target) if target else None}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@app.get("/api/finance/companies/{company_id}/cash-bank-transactions")
def finance_list_cash_bank_transactions(company_id: int,
        context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(CashBankTransaction).filter(
            CashBankTransaction.company_id == company_id
        ).order_by(CashBankTransaction.id.desc()).all()
        return {"items": [{
            "id": r.id, "account_id": r.account_id,
            "transaction_type": r.transaction_type,
            "transaction_date": r.transaction_date,
            "amount": float(r.amount or 0), "reference_no": r.reference_no,
            "description": r.description, "transfer_group": r.transfer_group
        } for r in rows], "total": len(rows)}
    finally:
        db.close()


@app.get("/api/finance/companies/{company_id}/expense-summary")
def finance_expense_summary(company_id: int,
        context=Depends(erp_require("orders.read"))):
    product_company_access(company_id, context)
    db = Session()
    try:
        rows = db.query(ExpenseVoucher).filter(
            ExpenseVoucher.company_id == company_id,
            ExpenseVoucher.status == "Approved"
        ).all()
        totals = {}
        for row in rows:
            category = db.query(ExpenseCategory).filter(
                ExpenseCategory.id == row.category_id
            ).first()
            name = category.name if category else "Uncategorised"
            totals[name] = totals.get(name, 0) + float(row.amount or 0)
        return {
            "total_approved": round(sum(totals.values()), 2),
            "total_paid": round(sum(float(r.amount or 0) for r in rows
                                     if r.payment_status == "Paid"), 2),
            "total_unpaid": round(sum(float(r.amount or 0) for r in rows
                                      if r.payment_status == "Unpaid"), 2),
            "by_category": [{"category": k, "amount": round(v, 2)}
                            for k, v in sorted(totals.items())]
        }
    finally:
        db.close()



# GENERAL ACCOUNTING MODULE
from app.accounting import install_accounting
install_accounting(
    app, Base, engine, Session, erp_require, product_company_access
)

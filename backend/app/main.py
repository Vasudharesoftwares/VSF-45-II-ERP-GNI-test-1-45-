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


@app.get("/api/core/parties")
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


@app.post("/api/core/companies/{company_id}/parties")
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
            expires_at=datetime.utcnow() + timedelta(hours=12)
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
            "expires_in": 43200,
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

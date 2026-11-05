import getpass
import re
import secrets
import json

import app.main as m

db = m.Session()

try:
    counts = {
        "companies": db.query(m.Company).count(),
        "users": db.query(m.ERPUser).count(),
        "assignments": db.query(m.ERPUserAssignment).count(),
    }

    print("Database:", counts)

    if any(counts.values()):
        raise RuntimeError(
            "Database is not empty. First-owner setup stopped safely."
        )

    print("\n========== VASUDHARE ERP FIRST-TIME SETUP ==========")

    company_name = input("Company legal name: ").strip()
    owner_name = input("Owner full name: ").strip()
    email = input("Owner email: ").strip().lower()
    password = getpass.getpass("Create password (minimum 12 characters): ")
    confirm = getpass.getpass("Confirm password: ")

    if not company_name or not owner_name or not email:
        raise ValueError("All fields are required.")

    if "@" not in email:
        raise ValueError("Enter a valid email address.")

    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters.")

    if password != confirm:
        raise ValueError("Passwords do not match.")

    if db.query(m.ERPUser).filter(m.ERPUser.email == email).first():
        raise ValueError("This email already exists.")

    permissions = m.erp_assignment_permissions("owner")

    if not permissions:
        raise RuntimeError("Could not generate owner permissions.")

    code = (
        re.sub(r"[^A-Z0-9]+", "_", company_name.upper()).strip("_")[:28]
        or "COMPANY"
    ) + "_" + secrets.token_hex(3).upper()

    company = m.Company(
        code=code,
        legal_name=company_name,
        display_name=company_name
    )
    db.add(company)
    db.flush()

    owner = m.ERPUser(
        full_name=owner_name,
        email=email,
        password_hash=m.erp_password_hash(password)
    )
    db.add(owner)
    db.flush()

    assignment = m.ERPUserAssignment(
        user_id=owner.id,
        company_id=company.id,
        branch_id=None,
        role="owner",
        permissions=json.dumps(permissions)
    )
    db.add(assignment)
    db.commit()

    print("\nSUCCESS: First owner account created.")
    print("Company:", company.legal_name)
    print("Company ID:", company.id)
    print("Owner:", owner.full_name)
    print("Login email:", owner.email)

except Exception:
    db.rollback()
    raise
finally:
    db.close()

from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Numeric,
    UniqueConstraint, CheckConstraint
)


def install_accounting(app, Base, engine, Session, erp_require,
                       product_company_access):

    class Account(Base):
        __tablename__ = "accounting_accounts"
        __table_args__ = (
            UniqueConstraint("company_id", "code",
                             name="uq_accounting_company_code"),
        )
        id = Column(Integer, primary_key=True)
        company_id = Column(Integer, ForeignKey("companies.id"),
                            nullable=False, index=True)
        code = Column(String(30), nullable=False)
        name = Column(String(150), nullable=False)
        account_type = Column(String(30), nullable=False)
        parent_id = Column(Integer, ForeignKey("accounting_accounts.id"))
        opening_balance = Column(Numeric(14, 2), default=0, nullable=False)
        is_active = Column(Integer, default=1, nullable=False)

    class Journal(Base):
        __tablename__ = "accounting_journals"
        id = Column(Integer, primary_key=True)
        company_id = Column(Integer, ForeignKey("companies.id"),
                            nullable=False, index=True)
        voucher_no = Column(String(40), nullable=False)
        voucher_date = Column(String(20), nullable=False)
        narration = Column(String(500))
        status = Column(String(20), default="Draft", nullable=False)
        total_debit = Column(Numeric(14, 2), default=0)
        total_credit = Column(Numeric(14, 2), default=0)
        created_at = Column(DateTime, default=datetime.utcnow)
        posted_at = Column(DateTime)

    class JournalLine(Base):
        __tablename__ = "accounting_journal_lines"
        id = Column(Integer, primary_key=True)
        journal_id = Column(Integer, ForeignKey("accounting_journals.id"),
                            nullable=False, index=True)
        account_id = Column(Integer, ForeignKey("accounting_accounts.id"),
                            nullable=False)
        description = Column(String(300))
        debit = Column(Numeric(14, 2), default=0, nullable=False)
        credit = Column(Numeric(14, 2), default=0, nullable=False)
        __table_args__ = (
            CheckConstraint("debit >= 0 AND credit >= 0",
                            name="ck_journal_nonnegative"),
        )

    class AccountInput(BaseModel):
        code: str = Field(min_length=1, max_length=30)
        name: str = Field(min_length=1, max_length=150)
        account_type: str
        parent_id: int | None = None
        opening_balance: float = 0

    class JournalLineInput(BaseModel):
        account_id: int
        description: str | None = None
        debit: float = 0
        credit: float = 0

    class JournalInput(BaseModel):
        voucher_no: str = Field(min_length=1, max_length=40)
        voucher_date: str
        narration: str | None = None
        lines: list[JournalLineInput] = Field(min_length=2)

    router = APIRouter()

    def account_data(a):
        return {
            "id": a.id, "code": a.code, "name": a.name,
            "account_type": a.account_type, "parent_id": a.parent_id,
            "opening_balance": float(a.opening_balance or 0),
            "is_active": bool(a.is_active)
        }

    def journal_data(j, db):
        lines = db.query(JournalLine).filter(
            JournalLine.journal_id == j.id
        ).all()
        return {
            "id": j.id, "voucher_no": j.voucher_no,
            "voucher_date": j.voucher_date, "narration": j.narration,
            "status": j.status, "total_debit": float(j.total_debit or 0),
            "total_credit": float(j.total_credit or 0),
            "lines": [{
                "id": x.id, "account_id": x.account_id,
                "account_name": db.query(Account.name).filter(
                    Account.id == x.account_id).scalar(),
                "description": x.description,
                "debit": float(x.debit or 0),
                "credit": float(x.credit or 0)
            } for x in lines]
        }

    @router.get("/api/accounting/companies/{company_id}/accounts")
    def list_accounts(company_id: int,
                      context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            rows = db.query(Account).filter(
                Account.company_id == company_id
            ).order_by(Account.code).all()
            return {"items": [account_data(a) for a in rows],
                    "total": len(rows)}
        finally:
            db.close()

    @router.post("/api/accounting/companies/{company_id}/accounts")
    def create_account(company_id: int, payload: AccountInput,
                       context=Depends(erp_require("orders.manage"))):
        product_company_access(company_id, context)
        if payload.account_type not in (
            "Asset", "Liability", "Equity", "Income", "Expense"
        ):
            raise HTTPException(400, "Invalid account type.")
        db = Session()
        try:
            row = Account(
                company_id=company_id, code=payload.code.strip(),
                name=payload.name.strip(),
                account_type=payload.account_type,
                parent_id=payload.parent_id,
                opening_balance=payload.opening_balance
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return account_data(row)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @router.get("/api/accounting/companies/{company_id}/journals")
    def list_journals(company_id: int,
                      context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            rows = db.query(Journal).filter(
                Journal.company_id == company_id
            ).order_by(Journal.id.desc()).all()
            return {"items": [journal_data(j, db) for j in rows],
                    "total": len(rows)}
        finally:
            db.close()

    @router.post("/api/accounting/companies/{company_id}/journals")
    def create_journal(company_id: int, payload: JournalInput,
                       context=Depends(erp_require("orders.manage"))):
        product_company_access(company_id, context)
        debit = sum(Decimal(str(x.debit)) for x in payload.lines)
        credit = sum(Decimal(str(x.credit)) for x in payload.lines)
        if debit <= 0 or debit != credit:
            raise HTTPException(
                400, "Journal must have equal, non-zero debit and credit totals."
            )
        if any(x.debit < 0 or x.credit < 0 or
               (x.debit > 0 and x.credit > 0) or
               (x.debit == 0 and x.credit == 0)
               for x in payload.lines):
            raise HTTPException(400, "Each line must have either debit or credit.")
        db = Session()
        try:
            exists = db.query(Journal).filter(
                Journal.company_id == company_id,
                Journal.voucher_no == payload.voucher_no
            ).first()
            if exists:
                raise HTTPException(409, "Voucher number already exists.")
            account_ids = {x.account_id for x in payload.lines}
            valid = db.query(Account.id).filter(
                Account.company_id == company_id,
                Account.id.in_(account_ids),
                Account.is_active == 1
            ).all()
            if len(valid) != len(account_ids):
                raise HTTPException(400, "One or more accounts are invalid.")
            row = Journal(
                company_id=company_id, voucher_no=payload.voucher_no,
                voucher_date=payload.voucher_date,
                narration=payload.narration,
                total_debit=debit, total_credit=credit
            )
            db.add(row)
            db.flush()
            for line in payload.lines:
                db.add(JournalLine(
                    journal_id=row.id, account_id=line.account_id,
                    description=line.description,
                    debit=line.debit, credit=line.credit
                ))
            db.commit()
            db.refresh(row)
            return journal_data(row, db)
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @router.patch("/api/accounting/journals/{journal_id}/post")
    def post_journal(journal_id: int,
                     context=Depends(erp_require("orders.manage"))):
        db = Session()
        try:
            row = db.query(Journal).filter(
                Journal.id == journal_id
            ).first()
            if not row:
                raise HTTPException(404, "Journal not found.")
            product_company_access(row.company_id, context)
            if row.status != "Draft":
                raise HTTPException(400, "Only draft journals can be posted.")
            if round(float(row.total_debit or 0), 2) != round(
                float(row.total_credit or 0), 2
            ):
                raise HTTPException(400, "Journal is not balanced.")
            row.status = "Posted"
            row.posted_at = datetime.utcnow()
            db.commit()
            return {"message": "Journal posted.", "id": row.id,
                    "status": row.status}
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def report_rows(db, company_id):
        rows = db.query(
            Account, JournalLine
        ).join(
            JournalLine, JournalLine.account_id == Account.id
        ).join(
            Journal, Journal.id == JournalLine.journal_id
        ).filter(
            Account.company_id == company_id,
            Journal.company_id == company_id,
            Journal.status == "Posted"
        ).all()
        totals = {}
        for account, line in rows:
            item = totals.setdefault(account.id, {
                "account_id": account.id, "code": account.code,
                "name": account.name, "account_type": account.account_type,
                "debit": 0.0, "credit": 0.0
            })
            item["debit"] += float(line.debit or 0)
            item["credit"] += float(line.credit or 0)
        return list(totals.values())

    @router.get("/api/accounting/companies/{company_id}/general-ledger")
    def general_ledger(company_id: int,
                       context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            return {"items": report_rows(db, company_id)}
        finally:
            db.close()

    @router.get("/api/accounting/companies/{company_id}/trial-balance")
    def trial_balance(company_id: int,
                      context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            rows = report_rows(db, company_id)
            for x in rows:
                net = x["debit"] - x["credit"]
                x["debit_balance"] = round(max(net, 0), 2)
                x["credit_balance"] = round(max(-net, 0), 2)
            return {
                "items": rows,
                "total_debit": round(sum(x["debit_balance"] for x in rows), 2),
                "total_credit": round(sum(x["credit_balance"] for x in rows), 2)
            }
        finally:
            db.close()

    @router.get("/api/accounting/companies/{company_id}/profit-loss")
    def profit_loss(company_id: int,
                    context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            rows = report_rows(db, company_id)
            income = sum(x["credit"] - x["debit"] for x in rows
                         if x["account_type"] == "Income")
            expenses = sum(x["debit"] - x["credit"] for x in rows
                           if x["account_type"] == "Expense")
            return {
                "income": round(income, 2),
                "expenses": round(expenses, 2),
                "net_profit": round(income - expenses, 2)
            }
        finally:
            db.close()

    @router.get("/api/accounting/companies/{company_id}/balance-sheet")
    def balance_sheet(company_id: int,
                      context=Depends(erp_require("orders.read"))):
        product_company_access(company_id, context)
        db = Session()
        try:
            rows = report_rows(db, company_id)
            assets = sum(x["debit"] - x["credit"] for x in rows
                         if x["account_type"] == "Asset")
            liabilities = sum(x["credit"] - x["debit"] for x in rows
                              if x["account_type"] == "Liability")
            equity = sum(x["credit"] - x["debit"] for x in rows
                         if x["account_type"] == "Equity")
            return {
                "assets": round(assets, 2),
                "liabilities": round(liabilities, 2),
                "equity": round(equity, 2),
                "liabilities_and_equity": round(liabilities + equity, 2),
                "difference": round(assets - liabilities - equity, 2)
            }
        finally:
            db.close()

    Base.metadata.create_all(bind=engine)
    app.include_router(router)

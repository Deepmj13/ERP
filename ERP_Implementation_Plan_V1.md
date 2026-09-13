# Multi-Tenant ERP — Implementation Plan (V1)

## 1. Product Definition

Build a multi-tenant SaaS ERP with one shared product experience across:

- Web
- Windows/macOS/Linux desktop
- Android/iOS mobile

High-level architecture:

```text
Flutter Clients
   |
   | HTTPS / REST
   v
API / Application Server
   |
   +--> Background Workers
   |
   v
PostgreSQL
   |
   +--> Redis
   |
   +--> S3-compatible Object Storage
```

### Recommended technology stack

| Layer | Technology |
|---|---|
| Frontend | Flutter |
| State management | Riverpod |
| Routing | go_router |
| Backend | NestJS + TypeScript |
| API | REST + OpenAPI |
| Database | PostgreSQL |
| ORM | Prisma or TypeORM |
| Cache / Queue | Redis |
| Background jobs | BullMQ / Redis |
| File storage | S3-compatible object storage |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Error monitoring | Sentry |
| Logging | Structured server-side logs |

The exact libraries may change, but the architectural boundaries should remain stable.

---

# 2. Architecture Rules

These rules should be treated as engineering constraints.

## Rule 1 — Flutter never connects directly to PostgreSQL

Correct:

```text
Flutter
  ↓
API
  ↓
Business Logic
  ↓
PostgreSQL
```

Never:

```text
Flutter → PostgreSQL
```

## Rule 2 — Tenant-owned records contain `tenant_id`

Examples:

```text
customers
products
warehouses
sales_orders
invoices
payments
employees
journal_entries
```

Each should be associated with a tenant.

## Rule 3 — Tenant isolation is enforced on the server

Do not trust a tenant ID supplied by the Flutter client.

The backend should determine the active tenant from authenticated user membership/session data.

## Rule 4 — Financial transactions are immutable after posting

Posted accounting records should not be silently edited or deleted.

Use:

```text
Incorrect Entry
   ↓
Reversal
   ↓
Correct Entry
```

## Rule 5 — Business documents use controlled lifecycle states

Example:

```text
DRAFT
  ↓
SUBMITTED
  ↓
APPROVED
  ↓
POSTED
  ↓
CANCELLED
```

Business actions must validate legal state transitions.

---

# 3. Repository Structure

Use a monorepo while the product is being developed as a unified platform.

```text
erp/
│
├── apps/
│   ├── flutter/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── api_contracts/
│   ├── shared_types/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── fixtures/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   └── decisions/
│
└── .github/
    └── workflows/
```

---

# 4. Flutter Architecture

Use feature-first organization instead of a global `screens/`, `widgets/`, and `services/` structure.

```text
apps/flutter/lib/

├── app/
│   ├── app.dart
│   ├── router/
│   ├── theme/
│   └── bootstrap/
│
├── core/
│   ├── network/
│   ├── auth/
│   ├── permissions/
│   ├── storage/
│   ├── errors/
│   ├── localization/
│   └── ui/
│
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── organization/
│   ├── crm/
│   ├── sales/
│   ├── inventory/
│   ├── procurement/
│   ├── finance/
│   ├── hr/
│   ├── projects/
│   ├── documents/
│   ├── notifications/
│   └── settings/
│
└── shared/
    ├── models/
    ├── enums/
    ├── formatters/
    └── validators/
```

Each major feature follows:

```text
feature/
├── data/
│   ├── datasources/
│   ├── models/
│   └── repositories/
│
├── domain/
│   ├── entities/
│   └── usecases/
│
└── presentation/
    ├── pages/
    ├── widgets/
    └── providers/
```

---

# 5. Backend Architecture

Use feature/module-based NestJS structure.

```text
apps/api/src/

├── main.ts
├── config/
│
├── common/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   ├── filters/
│   └── utils/
│
├── auth/
├── tenants/
├── users/
├── roles/
├── permissions/
├── organization/
├── crm/
├── sales/
├── inventory/
├── procurement/
├── finance/
├── hr/
├── projects/
├── documents/
├── notifications/
├── subscriptions/
└── audit/
```

Each business module should have a consistent pattern:

```text
controller
service
repository
dto
model/entity
validation
authorization
tests
```

---

# 6. Foundation Layer

Do not start with Finance or HR.

Build the platform foundation first:

```text
1. Authentication
2. Tenant management
3. Organization
4. Users
5. Roles
6. Permissions
7. Audit logging
8. File storage
9. Notifications
10. Settings
```

Dependency chain:

```text
Authentication
      ↓
Tenant
      ↓
Organization
      ↓
User
      ↓
Role
      ↓
Permission
      ↓
ERP Modules
```

---

# 7. Multi-Tenancy Model

Start with a shared PostgreSQL database.

Conceptually:

```text
Database
│
├── Tenant A
│   ├── users
│   ├── customers
│   ├── products
│   └── invoices
│
├── Tenant B
│   ├── users
│   ├── customers
│   ├── products
│   └── invoices
│
└── Tenant C
    └── ...
```

This is simpler operationally than a separate database per customer for V1.

### Tenant table

```text
tenants
--------
id
name
slug
status
timezone
currency
country
language
created_at
updated_at
```

### Tenant membership

```text
tenant_users
------------
tenant_id
user_id
status
```

A user can therefore belong to multiple companies in the future.

---

# 8. Identity Model

Keep `User` and `Employee` separate.

```text
User
 ├── Authentication
 ├── Tenant membership
 └── Permissions

Employee
 ├── HR information
 ├── Department
 ├── Attendance
 └── Payroll
```

A user account does not have to be an employee.

Example:

```text
External Accountant
      ↓
User account
      ↓
Finance permissions
      ↓
No HR employee record
```

---

# 9. RBAC

Use permission codes instead of hard-coded roles.

Examples:

```text
sales.quote.view
sales.quote.create
sales.quote.edit
sales.quote.approve
sales.quote.cancel

sales.order.view
sales.order.create
sales.order.approve

finance.invoice.view
finance.invoice.create
finance.invoice.approve
finance.invoice.post

inventory.stock.view
inventory.stock.adjust

hr.employee.view
hr.employee.edit

hr.payroll.view
hr.payroll.approve
```

Authorization flow:

```text
Request
  ↓
JWT
  ↓
User
  ↓
Tenant Membership
  ↓
Role
  ↓
Permission
  ↓
Business Operation
```

Hiding a Flutter button is not authorization. The API must enforce the same permission.

---

# 10. Core Database Domains

## Platform

```text
tenants
users
tenant_users
roles
permissions
role_permissions
user_roles
audit_logs
subscriptions
```

## Organization

```text
companies
branches
departments
locations
employees
```

## CRM

```text
customers
customer_contacts
leads
lead_activities
```

## Inventory

```text
products
product_categories
units
warehouses
warehouse_locations
stock_balances
stock_movements
batches
serial_numbers
```

## Sales

```text
quotations
quotation_items
sales_orders
sales_order_items
deliveries
delivery_items
invoices
invoice_items
payments
```

## Finance

```text
accounts
account_groups
journal_entries
journal_entry_lines
tax_rates
fiscal_periods
bank_accounts
bank_transactions
```

---

# 11. Database Conventions

Standardize these conventions before creating many tables.

Typical primary entity fields:

```text
id UUID
tenant_id UUID
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Important transactional entities should also track:

```text
created_by
updated_by
```

Use database constraints for:

```text
NOT NULL
UNIQUE
FOREIGN KEY
CHECK
```

Use tenant-scoped uniqueness where appropriate.

Example:

```text
UNIQUE(tenant_id, sku)
```

instead of globally unique:

```text
UNIQUE(sku)
```

This lets different companies use the same SKU.

---

# 12. Document Numbering

User-visible business numbers should not be database UUIDs.

Examples:

```text
INV-2026-000001
INV-2026-000002
SO-2026-000001
PO-2026-000001
```

Suggested table:

```text
document_sequences
------------------
tenant_id
document_type
financial_year
prefix
next_number
```

This permits company-specific formats such as:

```text
INV/2026-27/00001
SO/2026-27/00001
PO/2026-27/00001
```

---

# 13. First Major Business Workflow — Sales

Build one end-to-end vertical slice first:

```text
Customer
   ↓
Quotation
   ↓
Sales Order
   ↓
Delivery
   ↓
Invoice
   ↓
Payment
   ↓
Accounting
```

Example document lifecycle:

```text
Quotation
    ↓ accepted
Sales Order
    ↓ delivered
Delivery Note
    ↓ invoiced
Invoice
    ↓ paid
Payment
```

This should become the first complete integration test of the ERP platform.

---

# 14. Inventory Architecture

Do not implement stock as a mutable number only:

```text
product.stock = product.stock - 2
```

Instead maintain auditable stock movements.

Example:

```text
stock_movements

SALE
quantity = -2
warehouse = A
reference = DEL-2026-00125
```

Possible movement types:

```text
PURCHASE       +100
SALE            -20
TRANSFER        -10
TRANSFER        +10
ADJUSTMENT       -2
RETURN           +3
```

This provides traceability and supports reconciliation.

---

# 15. Finance Integration

Operational documents should create accounting events automatically wherever possible.

### Invoice example

```text
Invoice
   ↓
Accounting Service
   ↓
Journal Entry
   ↓
Debit: Accounts Receivable
Credit: Sales Revenue
Credit: Output Tax
```

### Payment example

```text
Payment
   ↓
Journal Entry
   ↓
Debit: Bank
Credit: Accounts Receivable
```

This connects operational workflows to the general ledger.

---

# 16. API Standards

Version the API:

```text
/api/v1/
```

CRUD example:

```text
GET    /api/v1/customers
GET    /api/v1/customers/:id
POST   /api/v1/customers
PATCH  /api/v1/customers/:id
DELETE /api/v1/customers/:id
```

Business actions should use explicit endpoints:

```text
POST /api/v1/invoices/:id/submit
POST /api/v1/invoices/:id/approve
POST /api/v1/invoices/:id/post
POST /api/v1/invoices/:id/cancel
```

Avoid allowing clients to arbitrarily change lifecycle state:

```text
PATCH invoice.status = "posted"
```

The backend must validate the transition and required permissions.

---

# 17. API Response Standards

### Success

```json
{
  "data": {},
  "meta": {}
}
```

### Collection

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 241
  }
}
```

### Error

```json
{
  "error": {
    "code": "INVOICE_ALREADY_POSTED",
    "message": "Posted invoices cannot be edited."
  }
}
```

Keep this format consistent across every module.

---

# 18. Pagination, Search and Filtering

ERP tables can contain very large datasets.

Never load an entire table into Flutter.

Example:

```text
GET /api/v1/invoices
    ?page=1
    &limit=25
    &search=acme
    &sort=-created_at
    &status=approved
```

The API should perform filtering, sorting and pagination.

---

# 19. Responsive UX

Do not simply shrink the desktop application for mobile.

## Desktop / Web

Prioritize:

```text
Data tables
Complex forms
Reports
Charts
Bulk actions
Side navigation
```

## Mobile

Prioritize:

```text
Dashboard
Approvals
Notifications
Quick actions
Tasks
Field operations
```

Use the same domain/business logic but separate presentation patterns when necessary.

---

# 20. Offline Strategy

For V1 use:

```text
Online-first
```

Consider offline functionality later for:

```text
Customer lookup
Product lookup
Assigned tasks
Draft sales orders
Field activities
Attendance
```

Avoid offline accounting posting and other high-risk financial operations in the first release.

---

# 21. Audit System

Important operations should automatically generate audit records.

Suggested structure:

```text
audit_logs
----------
id
tenant_id
user_id
action
entity_type
entity_id
old_values
new_values
ip_address
created_at
```

Example:

```text
USER: John
ACTION: invoice.approve
ENTITY: INV-2026-00123
TIME: 2026-09-13 10:32
```

Prefer centralized backend instrumentation instead of manually coding audit logging in every feature.

---

# 22. Notifications

Use one central event-driven notification service.

```text
Business Event
     ↓
Notification Service
     ↓
 ┌────────────┬────────────┬────────────┐
 │ In-app     │ Email      │ Push       │
 └────────────┴────────────┴────────────┘
```

Examples:

```text
Invoice approved
Low stock
Leave approved
Purchase order awaiting approval
Payment overdue
New lead assigned
```

---

# 23. Background Worker

Long-running work should not block normal API requests.

Use background workers for:

```text
PDF invoice generation
Email delivery
Push notifications
Report generation
Bulk imports
Large exports
Scheduled jobs
File processing
```

Example:

```text
POST Invoice
      ↓
API saves invoice
      ↓
Queue job
      ↓
Worker processes PDF
      ↓
PDF stored in object storage
      ↓
Notification sent
```

---

# 24. Security Baseline

Before production:

```text
HTTPS everywhere
JWT access tokens
Refresh-token rotation
Password hashing
Rate limiting
Input validation
SQL injection protection
CORS policy
CSRF protection where applicable
RBAC authorization
Tenant isolation
Audit logging
Encrypted secrets
Database backups
Object storage access controls
```

The most important property:

```text
Tenant A can NEVER access Tenant B data.
```

Automated cross-tenant security tests are mandatory.

---

# 25. Testing Strategy

Testing begins with the first feature, not at the end.

## Flutter

```text
Unit tests
Widget tests
Integration tests
```

## Backend

```text
Unit tests
Integration tests
API / E2E tests
```

## Database

```text
Migration tests
Seed/fixture validation
Constraint tests
```

## Security

```text
Tenant-isolation tests
Authorization tests
Permission boundary tests
```

Critical example:

```text
User from Tenant A
      ↓
Requests Tenant B invoice
      ↓
403/404
      ↓
No data returned
```

Repeat this pattern across all tenant-owned resources.

---

# 26. CI/CD

Every pull request should run:

```text
1. Formatting
2. Static analysis
3. Unit tests
4. Integration tests
5. API build
6. Flutter build
```

Deployment flow:

```text
GitHub
   ↓
CI
   ↓
Docker Images
   ↓
Staging
   ↓
Smoke Tests
   ↓
Production
```

Maintain separate environments:

```text
development
staging
production
```

---

# 27. Development Phases

## Phase 0 — Architecture

Deliver:

```text
✓ Repository
✓ Monorepo structure
✓ Database conventions
✓ API conventions
✓ Authentication design
✓ Tenant design
✓ RBAC design
✓ Error format
✓ CI pipeline
✓ Local development environment
```

No major business module yet.

### Definition of Done

A developer can clone the repository, start the stack locally, run migrations, run tests, and build the applications.

---

## Phase 1 — Platform Foundation

Build:

```text
✓ Registration / login
✓ Tenant creation
✓ Tenant switching
✓ User management
✓ Roles
✓ Permissions
✓ Organization
✓ Branches
✓ Settings
✓ Audit logs
✓ File storage
```

### Definition of Done

A company can register, create its organization, invite users, assign roles, and access only its own data.

---

## Phase 2 — CRM + Master Data

Build:

```text
✓ Customers
✓ Contacts
✓ Products
✓ Categories
✓ Units
✓ Tax configuration
```

### Definition of Done

A tenant can create and manage reusable customers and products used by downstream modules.

---

## Phase 3 — Sales

Build:

```text
✓ Quotations
✓ Sales orders
✓ Delivery
✓ Invoices
✓ Payments
✓ PDF documents
```

Complete workflow:

```text
Customer
→ Quote
→ Order
→ Delivery
→ Invoice
→ Payment
```

### Definition of Done

A full sales transaction can be created, approved, delivered, invoiced, paid and audited.

---

## Phase 4 — Inventory

Build:

```text
✓ Warehouses
✓ Stock
✓ Stock movements
✓ Transfers
✓ Adjustments
✓ Batches
✓ Serial numbers
✓ Low-stock alerts
```

Integrate:

```text
Purchases → Stock
Sales → Stock
Returns → Stock
Adjustments → Stock
```

### Definition of Done

Every inventory quantity change has an auditable movement reference.

---

## Phase 5 — Finance

Build:

```text
✓ Chart of accounts
✓ Journal entries
✓ General ledger
✓ Accounts receivable
✓ Accounts payable
✓ Bank accounts
✓ Bank transactions
✓ Reconciliation
✓ Tax reports
✓ Fiscal periods
```

Integrate:

```text
Sales → Finance
Purchasing → Finance
Payments → Finance
```

### Definition of Done

Operational transactions can generate correct accounting entries and financial reports can reconcile to transaction data.

---

## Phase 6 — Procurement

Build:

```text
✓ Vendors
✓ Purchase requests
✓ Purchase orders
✓ GRN
✓ Vendor bills
✓ Vendor payments
```

Workflow:

```text
Purchase Request
      ↓
Purchase Order
      ↓
Goods Receipt
      ↓
Vendor Bill
      ↓
Payment
```

---

## Phase 7 — HR

Build:

```text
✓ Employees
✓ Departments
✓ Attendance
✓ Leave
✓ Salary structures
✓ Payroll
✓ Payslips
```

Keep payroll accounting integration logically separated from basic employee/attendance functionality.

---

## Phase 8 — Operations

Build:

```text
✓ Projects
✓ Tasks
✓ Approvals
✓ Documents
✓ Notifications
✓ Dashboards
```

---

## Phase 9 — SaaS Platform

After core ERP workflows are stable:

```text
✓ Subscription plans
✓ Trials
✓ Billing
✓ Feature limits
✓ User limits
✓ Usage metrics
✓ Customer administration
```

Do not over-invest in SaaS billing before the ERP's core business workflows are proven.

---

# 28. V1 Scope

Keep the first production release focused.

```text
PLATFORM
├── Multi-tenancy
├── Authentication
├── RBAC
└── Audit

MASTER DATA
├── Customers
├── Products
└── Tax

SALES
├── Quotations
├── Sales Orders
├── Delivery
├── Invoices
└── Payments

INVENTORY
├── Warehouse
├── Stock
└── Movements

FINANCE
├── Accounts
├── Journal
└── Basic Ledger

DASHBOARD
└── Core KPIs
```

This is already a genuine ERP product.

---

# 29. Production Readiness Checklist

The V1 release should not be considered production-ready until:

```text
[ ] Tenant isolation tested
[ ] Authentication tested
[ ] RBAC tested
[ ] Database migrations reproducible
[ ] Backup and restore tested
[ ] Audit logging operational
[ ] API documented
[ ] Error handling standardized
[ ] Financial transactions protected
[ ] Inventory movements auditable
[ ] PDF generation reliable
[ ] Email notifications reliable
[ ] Web build tested
[ ] Desktop build tested
[ ] Mobile build tested
[ ] Automated CI passing
[ ] Staging environment working
[ ] Production monitoring working
[ ] Security review completed
[ ] Performance/load testing completed for critical endpoints
[ ] Database indexes reviewed for major queries
[ ] Disaster recovery procedure documented
```

---

# 30. Recommended Implementation Dependency Graph

```text
                    Authentication
                           ↓
                    Multi-tenancy
                           ↓
                     Organization
                           ↓
                  Users / RBAC
                           ↓
                     Master Data
                  ┌────────┴────────┐
                  ↓                 ↓
                 CRM              Products
                  │                 │
                  └────────┬────────┘
                           ↓
                         Sales
                           ↓
              ┌────────────┴────────────┐
              ↓                         ↓
         Inventory                  Finance
              │                         │
              └────────────┬────────────┘
                           ↓
                       Dashboard
```

---

# 31. First Technical Deliverable

Before implementing the full ERP, produce these four artifacts for V1:

```text
1. PostgreSQL ERD
   ├── Tables
   ├── Columns
   ├── Foreign keys
   ├── Indexes
   └── Constraints

2. REST API Specification
   ├── Endpoints
   ├── Request DTOs
   ├── Response DTOs
   ├── Errors
   └── Permissions

3. Flutter Screen / Route Map
   ├── Web/Desktop routes
   ├── Mobile routes
   ├── Forms
   ├── Tables
   └── Dashboard

4. End-to-End Workflow Specification
   Customer
      → Quote
      → Order
      → Delivery
      → Invoice
      → Payment
      → Accounting
```

These should become the source of truth for development.

---

# 32. Core Principle

The ERP should not be designed as:

```text
A collection of CRUD modules
```

It should be designed as:

```text
Platform
  +
Shared Master Data
  +
Business Workflows
  +
Accounting/Inventory Invariants
  +
Permissions
  +
Auditability
  +
Tenant Isolation
```

That architecture will make Finance, HR, Inventory, Procurement, CRM and future modules plug into the same reliable foundation instead of becoming independent mini-applications.

---

# 33. Immediate Build Order

The recommended implementation order is:

```text
STEP 01
Repository + Docker + CI
        ↓
STEP 02
PostgreSQL + migrations
        ↓
STEP 03
Authentication
        ↓
STEP 04
Multi-tenancy
        ↓
STEP 05
Users + RBAC
        ↓
STEP 06
Organization
        ↓
STEP 07
Customers + Products
        ↓
STEP 08
Quotation
        ↓
STEP 09
Sales Order
        ↓
STEP 10
Delivery
        ↓
STEP 11
Invoice
        ↓
STEP 12
Payment
        ↓
STEP 13
Inventory movements
        ↓
STEP 14
Accounting entries
        ↓
STEP 15
Dashboard
        ↓
STEP 16
Security + E2E testing
        ↓
STEP 17
Staging deployment
        ↓
STEP 18
Production V1
```

The objective is to make the first release a complete, secure **order-to-cash ERP workflow**, while keeping the architecture ready for Procurement, HR, Payroll, advanced Finance, CRM and SaaS billing.

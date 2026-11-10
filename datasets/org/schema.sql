-- org: who reports to whom (a self join, a tree), departments, and an on-call rota.

CREATE TABLE departments (
  id     int PRIMARY KEY,
  name   text NOT NULL UNIQUE,
  budget numeric(12,2)
);

CREATE TABLE employees (
  id         int PRIMARY KEY,
  name       text NOT NULL,
  manager_id int REFERENCES employees,
  dept_id    int REFERENCES departments,
  title      text NOT NULL,
  salary     numeric(10,2) NOT NULL CHECK (salary > 0),
  hired_on   date NOT NULL
);

CREATE TABLE oncall (
  shift_date  date NOT NULL,
  employee_id int  NOT NULL REFERENCES employees,
  on_call     boolean NOT NULL,
  PRIMARY KEY (shift_date, employee_id)
);

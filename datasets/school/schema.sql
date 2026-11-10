-- school: the textbook schema. small enough to print every table whole.

CREATE TABLE instructors (
  id     int PRIMARY KEY,
  name   text NOT NULL,
  dept   text NOT NULL,
  office text,
  salary numeric(9,2) NOT NULL
);

CREATE TABLE students (
  id         int PRIMARY KEY,
  name       text NOT NULL,
  email      text UNIQUE,
  year       smallint NOT NULL CHECK (year BETWEEN 1 AND 4),
  advisor_id int REFERENCES instructors
);

CREATE TABLE courses (
  code          text PRIMARY KEY,
  title         text NOT NULL,
  dept          text NOT NULL,
  credits       smallint NOT NULL CHECK (credits > 0),
  instructor_id int REFERENCES instructors
);

CREATE TABLE enrollments (
  student_id  int  NOT NULL REFERENCES students,
  course_code text NOT NULL REFERENCES courses,
  term        text NOT NULL,
  grade       char(1) CHECK (grade IN ('A','B','C','D','F')),
  PRIMARY KEY (student_id, course_code, term)
);

CREATE TABLE prerequisites (
  course_code   text NOT NULL REFERENCES courses,
  requires_code text NOT NULL REFERENCES courses,
  PRIMARY KEY (course_code, requires_code),
  CHECK (course_code <> requires_code)
);

-- unnormalized on purpose: one row per enrollment with everything repeated (normal forms)
CREATE TABLE enrollments_flat (
  student_name      text,
  student_email     text,
  course_code       text,
  course_title      text,
  instructor_name   text,
  instructor_office text,
  term              text,
  grade             char(1)
);

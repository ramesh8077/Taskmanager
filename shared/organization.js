const DEPARTMENTS = Object.freeze([
  "Development",
  "Digital Marketing",
  "Legal",
  "Graphic Design",
  "HR",
  "Sales",
  "Operations",
]);

const POSITIONS = Object.freeze([
  "MANAGER",
  "SUB_MANAGER",
  "TEAM_LEAD",
  "EMPLOYEE",
  "INTERN",
]);

const POSITION_RANK = Object.freeze({
  MANAGER: 5,
  SUB_MANAGER: 4,
  TEAM_LEAD: 3,
  EMPLOYEE: 2,
  INTERN: 1,
});

const REPORTING_POSITIONS = Object.freeze({
  MANAGER: [],
  SUB_MANAGER: ["MANAGER"],
  TEAM_LEAD: ["SUB_MANAGER", "MANAGER"],
  EMPLOYEE: ["TEAM_LEAD", "SUB_MANAGER", "MANAGER"],
  INTERN: ["TEAM_LEAD", "SUB_MANAGER", "MANAGER"],
});

module.exports = {
  DEPARTMENTS,
  POSITIONS,
  POSITION_RANK,
  REPORTING_POSITIONS,
};

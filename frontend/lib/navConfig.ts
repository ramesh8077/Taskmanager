export type Position =
  | "MANAGER"
  | "SUB_MANAGER"
  | "TEAM_LEAD"
  | "EMPLOYEE"
  | "INTERN";

export interface NavigationItem {
  label: string;
  href: string;
  icon: string;
  allowedPositions: readonly Position[];
  permission: string;
}

const managers: readonly Position[] = ["MANAGER"];
const leads: readonly Position[] = ["SUB_MANAGER", "TEAM_LEAD"];
const taskCreators: readonly Position[] = ["MANAGER", "SUB_MANAGER", "TEAM_LEAD", "EMPLOYEE"];
const employees: readonly Position[] = ["EMPLOYEE", "INTERN"];
const everyone: readonly Position[] = [...managers, ...leads, ...employees];

export const navigationItems: readonly NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "D", allowedPositions: everyone, permission: "task:view:own" },
  { label: "Projects", href: "/dashboard/projects", icon: "PR", allowedPositions: managers, permission: "project:view:own" },
  { label: "All Tasks", href: "/dashboard/all-tasks", icon: "T", allowedPositions: managers, permission: "task:view:any" },
  { label: "All Tickets", href: "/dashboard/all-tickets", icon: "K", allowedPositions: managers, permission: "ticket:view:any" },
  { label: "All Teams", href: "/dashboard/teams", icon: "G", allowedPositions: managers, permission: "user:view:any" },
  { label: "Members", href: "/dashboard/members", icon: "M", allowedPositions: managers, permission: "user:view:any" },
  { label: "Create Task", href: "/dashboard/create-task", icon: "+", allowedPositions: taskCreators, permission: "task:create" },
  { label: "Deadline Requests", href: "/dashboard/deadline-requests", icon: "R", allowedPositions: ["MANAGER", "SUB_MANAGER", "TEAM_LEAD"], permission: "task:update:own" },
  { label: "Reports", href: "/dashboard/reports", icon: "P", allowedPositions: managers, permission: "report:view:any" },
  { label: "Settings", href: "/dashboard/settings", icon: "S", allowedPositions: managers, permission: "settings:manage" },
  { label: "Team Tasks", href: "/dashboard/team-tasks", icon: "T", allowedPositions: leads, permission: "task:view:own" },
  { label: "Team Tickets", href: "/dashboard/team-tickets", icon: "K", allowedPositions: leads, permission: "ticket:view:own" },
  { label: "My Team", href: "/dashboard/my-team", icon: "G", allowedPositions: leads, permission: "user:view:team" },
  { label: "My Tasks", href: "/dashboard/my-tasks", icon: "T", allowedPositions: everyone, permission: "task:view:own" },
  { label: "My Tickets", href: "/dashboard/my-tickets", icon: "K", allowedPositions: employees, permission: "ticket:view:own" },
  { label: "Profile", href: "/dashboard/profile", icon: "U", allowedPositions: everyone, permission: "task:view:own" },
];

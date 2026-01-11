/**
 * LinkedIn Profile Schemas
 * Zod schemas for profile data extraction
 */

import { z } from "zod";

// Profile summary (from search results)
export const ProfileSummarySchema = z.object({
  name: z.string().describe("Full name of the person"),
  headline: z.string().optional().describe("Professional headline"),
  profileUrl: z.string().optional().describe("LinkedIn profile URL"),
  profileId: z.string().optional().describe("LinkedIn profile ID (from URL)"),
  connectionDegree: z.string().optional().describe("1st, 2nd, 3rd, or Out of Network"),
  location: z.string().optional().describe("Location"),
  currentCompany: z.string().optional().describe("Current company name"),
  currentTitle: z.string().optional().describe("Current job title"),
  profileImageUrl: z.string().optional().describe("Profile picture URL"),
});

// Experience entry
export const ExperienceSchema = z.object({
  title: z.string().describe("Job title"),
  company: z.string().describe("Company name"),
  duration: z.string().optional().describe("Duration (e.g., '2 yrs 3 mos')"),
  dateRange: z.string().optional().describe("Date range (e.g., 'Jan 2020 - Present')"),
  location: z.string().optional().describe("Work location"),
  description: z.string().optional().describe("Role description"),
});

// Education entry
export const EducationSchema = z.object({
  school: z.string().describe("School/University name"),
  degree: z.string().optional().describe("Degree type and field"),
  dateRange: z.string().optional().describe("Years attended"),
});

// Full profile data (from profile page)
export const FullProfileSchema = z.object({
  // Basic info
  name: z.string().describe("Full name"),
  headline: z.string().optional().describe("Professional headline"),
  profileUrl: z.string().optional().describe("LinkedIn profile URL"),
  profileId: z.string().optional().describe("LinkedIn profile ID"),
  connectionDegree: z.string().optional().describe("Connection degree"),
  location: z.string().optional().describe("Location"),

  // About section
  about: z.string().optional().describe("About/summary section"),

  // Contact info (if visible)
  email: z.string().optional().describe("Email address if visible"),
  phone: z.string().optional().describe("Phone number if visible"),
  website: z.string().optional().describe("Personal website if listed"),

  // Experience
  experience: z.array(ExperienceSchema).optional().describe("Work experience"),

  // Education
  education: z.array(EducationSchema).optional().describe("Education history"),

  // Skills
  skills: z.array(z.string()).optional().describe("Top skills"),

  // Current position (derived)
  currentTitle: z.string().optional().describe("Current job title"),
  currentCompany: z.string().optional().describe("Current company"),

  // Connection status
  isConnected: z.boolean().optional().describe("Whether you are connected"),
  isPending: z.boolean().optional().describe("Whether connection request is pending"),

  // Follower count
  followers: z.string().optional().describe("Number of followers"),
  connections: z.string().optional().describe("Number of connections"),
});

// Search results
export const SearchResultsSchema = z.object({
  profiles: z.array(ProfileSummarySchema),
  totalResults: z.string().optional().describe("Total number of results"),
  hasMoreResults: z.boolean().optional(),
});

// Company employee listing
export const CompanyPeopleSchema = z.object({
  companyName: z.string().describe("Company name"),
  employees: z.array(ProfileSummarySchema),
  totalEmployees: z.string().optional().describe("Total employees on LinkedIn"),
});

// Connection status
export const ConnectionStatusSchema = z.object({
  status: z.enum(["connected", "pending", "not_connected", "unknown"]),
  canMessage: z.boolean().optional(),
  canConnect: z.boolean().optional(),
});

// Message/Connection result
export const ActionResultSchema = z.object({
  success: z.boolean(),
  status: z.string().describe("Status message"),
  error: z.string().optional(),
});

export default {
  ProfileSummarySchema,
  FullProfileSchema,
  SearchResultsSchema,
  CompanyPeopleSchema,
  ConnectionStatusSchema,
  ActionResultSchema,
  ExperienceSchema,
  EducationSchema,
};

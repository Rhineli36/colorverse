import { z } from "zod";

export const CloudMembershipSchema = z.strictObject({
  enrollmentId: z.uuid(),
  classId: z.uuid(),
  title: z.string().min(1),
  timezone: z.string().min(1),
  role: z.enum(["student", "teacher", "assistant"]),
});
const common = {
  identity: z.strictObject({ id: z.uuid(), email: z.string().min(1) }),
  cloudWrites: z.boolean(),
};
export const CloudSessionSchema = z.discriminatedUnion("access", [
  z.strictObject({
    ...common,
    access: z.literal("pending-enrollment"),
    database: z.enum(["not-configured", "connected"]),
    memberships: z.tuple([]),
  }),
  z.strictObject({
    ...common,
    access: z.literal("active"),
    database: z.literal("connected"),
    memberships: z.array(CloudMembershipSchema).min(1),
  }),
  z.strictObject({
    ...common,
    access: z.literal("blocked"),
    database: z.literal("connected"),
    memberships: z.tuple([]),
  }),
]);
export type CloudSession = z.infer<typeof CloudSessionSchema>;
export type CloudMembership = z.infer<typeof CloudMembershipSchema>;

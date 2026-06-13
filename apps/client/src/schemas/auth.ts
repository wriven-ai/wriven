import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid workspace email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Enter a valid work email address'),
  orgName: z.string().min(1, 'Organization name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  agreeTerms: z.boolean().refine((value) => value === true, {
    message: 'You must agree to Wriven’s privacy policy and terms.',
  }),
});

export type RegisterValues = z.infer<typeof registerSchema>;

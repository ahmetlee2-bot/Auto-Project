import "server-only";
import Stripe from "stripe";
import { stripeConfigurationError } from "./config";

let client: Stripe | undefined;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const configurationError = stripeConfigurationError(key, process.env.NODE_ENV);
  if (configurationError) throw new Error(configurationError);
  if (!client) client = new Stripe(key);
  return client;
}

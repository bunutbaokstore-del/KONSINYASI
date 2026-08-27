import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const";
import { getUserRole } from "../supabase-admin";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const requireSupabaseUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.supabaseUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      supabaseUser: ctx.supabaseUser,
    },
  });
});

export const supabaseProtectedProcedure = t.procedure.use(requireSupabaseUser);

export const userManagementProcedure = supabaseProtectedProcedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    const role = getUserRole(ctx.supabaseUser);

    if (role !== "distributor" && role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat mengelola pengguna." });
    }

    return next({
      ctx: {
        ...ctx,
        supabaseUser: ctx.supabaseUser,
      },
    });
  }),
);

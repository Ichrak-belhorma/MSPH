import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { meRouter } from "../modules/auth/me.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";
import { customersRouter } from "../modules/customers/customers.routes.js";
import { landlordsRouter } from "../modules/landlords/landlords.routes.js";
import { propertiesRouter } from "../modules/properties/properties.routes.js";
import { treatmentsRouter } from "../modules/treatments/treatments.routes.js";
import { casesRouter } from "../modules/cases/cases.routes.js";
import { visitsRouter } from "../modules/visits/visits.routes.js";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/me", meRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/customers", customersRouter);
apiRouter.use("/landlords", landlordsRouter);
apiRouter.use("/properties", propertiesRouter);
apiRouter.use("/treatments", treatmentsRouter);
apiRouter.use("/cases", casesRouter);
apiRouter.use("/visits", visitsRouter);

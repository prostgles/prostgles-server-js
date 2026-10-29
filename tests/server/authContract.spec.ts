import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import express from "express";
import prostgles, { type InitResult, type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { isObject, type AuthOutput, type AuthSocketSchema } from "prostgles-types";
import { io } from "socket.io-client";
import type * as clientAuth from "../client/node_modules/prostgles-client/dist/getAuthHandler";

export const testAuthContract = async (db: DB) => {
  const { getAuthHandler, authRequest } = createRequire(path.resolve("../client/package.json"))(
    "prostgles-client/dist/getAuthHandler",
  ) as typeof clientAuth;
  await test("HTTP auth contract validates requests and callback results", async (context) => {
    const app = express();
    let redirectPageResponse: unknown = { account: "signed in" };
    app.use(express.json());
    app.get("/", (_req, res) => res.send("Signed in"));
    app.get("/json", (_req, res) => res.json(redirectPageResponse));
    app.post("/malformed", (_req, res) => res.json({ success: true, code: "unknown-code" }));
    app.post("/invalid-status", (_req, res) => res.status(401).json({ success: true }));
    app.post("/plain-error", (_req, res) => res.status(502).send("Upstream unavailable"));
    app.post("/redirect/:operation", (req, res) => res.redirect(307, `/${req.params.operation}`));
    const http = createServer(app);
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const address = http.address();
    assert(address && typeof address === "object");
    const endpoint = `http://127.0.0.1:${address.port}`;
    const socket = io(endpoint, { autoConnect: false });
    const session = {
      sid: "auth-contract-session",
      expires: Date.now() + 60_000,
      onExpiration: "redirect" as const,
    };
    const authData: AuthSocketSchema = {
      user: undefined,
      providers: undefined,
      preferredLogin: undefined,
      login: { mode: "email+password", loginRoute: "/login?returnURL=%2F", logoutRoute: "/logout" },
      signupWithEmailAndPassword: {
        minPasswordLength: 8,
        url: "/register",
        emailConfirmationRoute: "/magic-link",
      },
    };
    const authOptions = {
      socket,
      endpoint,
      authData,
      onReload: undefined,
      credentials: undefined,
      redirect: undefined,
    };
    const auth = getAuthHandler(authOptions);
    const { login, signupWithEmailAndPassword: register, confirmEmail } = auth;
    assert(login && register && confirmEmail);
    let registrationCalls = 0;
    let loginCalls = 0;
    let verificationCalls = 0;
    let registrationResult: unknown = { success: true, code: "email-verification-code-sent" };
    let instance: InitResult | undefined;
    const post = (path: string, data: unknown) =>
      fetch(endpoint + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        redirect: "manual",
      });

    try {
      await db.none("CREATE SCHEMA auth_contract_test");
      instance = await prostgles({
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { auth_contract_test: 1 },
        watchSchema: false,
        onReady: () => {},
        publish: {},
        auth: {
          getUser: () => undefined,
          findUser: () => undefined,
          responseThrottle: 1,
          loginSignupConfig: {
            app,
            publicRoutes: ["/"],
            cookieOptions: { secure: false },
            login: (data) => {
              loginCalls++;
              if (data.type !== "username") return "provider-issue";
              if (data.username === "error@example.com") throw new Error("Private login error");
              if (data.password !== "password123") return "invalid-password";
              if (data.username === "totp@example.com") {
                if (!data.totp_token && !data.totp_recovery_code) return "totp-token-missing";
                if (data.totp_token !== "123456" && data.totp_recovery_code !== "recovery-code") {
                  return "invalid-totp-code";
                }
              }
              return { session };
            },
            logout: () => undefined,
            signupWithEmail: {
              requirePassword: true,
              onRegister: ({ email, password }) => {
                registrationCalls++;
                if (email === "error@example.com") {
                  return Promise.reject(new Error("Private registration error"));
                }
                assert.equal(email, "user@example.com");
                assert.equal(password, "password123");
                /* Simulate an untyped application's callback at the runtime boundary. */
                return registrationResult as AuthOutput<"register">;
              },
            },
            onMagicLinkOrOTP: (data) => {
              verificationCalls++;
              if (data.type === "magic-link" || data.code === "login-code") return { session };
              if (data.code === "error-code") throw new Error("Private verification error");
              if (data.code === "invalid-result") return { session: undefined };
              if (data.code === "email-code") {
                return { session: undefined, response: { success: true, code: "email-verified" } };
              }
              return { response: { success: false, code: "expired-otp-code" } };
            },
          },
        },
      });

      await context.test(
        "registration and email verification retain their distinct results",
        async () => {
          assert.deepEqual(
            await register({ username: "user@example.com", password: "password123" }),
            {
              success: true,
              code: "email-verification-code-sent",
            },
          );
          assert.deepEqual(await confirmEmail({ email: "user@example.com", code: "email-code" }), {
            success: true,
            code: "email-verified",
          });
          assert.deepEqual(
            await confirmEmail({ email: "user@example.com", code: "expired-code" }),
            {
              success: false,
              code: "expired-otp-code",
            },
          );
        },
      );

      await context.test("redirected JSON preserves auth codes, messages and tokens", async () => {
        const registrationResponse = {
          success: true,
          code: "email-verification-code-sent",
          message: "Check your inbox",
        } as const;
        registrationResult = registrationResponse;
        const redirectedAuthOptions = {
          ...authOptions,
          authData: {
            ...authData,
            signupWithEmailAndPassword: {
              minPasswordLength: 8,
              url: "/redirect/register",
              emailConfirmationRoute: "/redirect/magic-link",
            },
          },
        };
        const redirectedAuth = getAuthHandler(redirectedAuthOptions);
        assert(redirectedAuth.signupWithEmailAndPassword && redirectedAuth.confirmEmail);
        try {
          assert.deepEqual(
            await redirectedAuth.signupWithEmailAndPassword({
              username: "user@example.com",
              password: "password123",
            }),
            { ...registrationResponse, redirect_url: endpoint + "/register" },
          );
          assert.deepEqual(
            await redirectedAuth.confirmEmail({ email: "user@example.com", code: "email-code" }),
            {
              success: true,
              code: "email-verified",
              redirect_url: endpoint + "/magic-link",
            },
          );
          const redirectRejectingAuth = getAuthHandler({
            ...redirectedAuthOptions,
            redirect: "error",
          });
          assert(redirectRejectingAuth.signupWithEmailAndPassword);
          await assert.rejects(
            redirectRejectingAuth.signupWithEmailAndPassword({
              username: "user@example.com",
              password: "password123",
            }),
            TypeError,
          );
          assert.deepEqual(
            await authRequest(
              "magicLinkOrOTP",
              endpoint + "/redirect/magic-link",
              { id: "link-id", returnToken: true },
              "POST",
              {},
            ),
            {
              success: true,
              token: session.sid,
              redirect_url: endpoint + "/magic-link",
            },
          );
        } finally {
          registrationResult = {
            success: true,
            code: "email-verification-code-sent",
          };
        }
      });

      await context.test("login redirects accept JSON pages without an auth result", async () => {
        const credentials = {
          username: "user@example.com",
          password: "password123",
        };
        for (const pageResponse of [
          { account: "signed in" },
          ["signed in"],
          "signed in",
          42,
          null,
        ]) {
          redirectPageResponse = pageResponse;
          assert.deepEqual(
            await authRequest(
              "login",
              endpoint + "/login?returnURL=%2Fjson",
              credentials,
              "POST",
              {},
            ),
            { success: true, redirect_url: endpoint + "/json" },
          );
          const directResponse = await authRequest(
            "login",
            endpoint + "/json",
            credentials,
            "GET",
            {},
          );
          assert.equal(directResponse.success, false);
        }
      });

      await context.test("invalid inputs are rejected before application callbacks", async () => {
        const callsBefore = { registrationCalls, loginCalls, verificationCalls };
        for (const [path, data] of [
          ["/login", { username: 123 }],
          ["/login", { username: "user@example.com", remember_me: "yes" }],
          ["/login", { username: "user@example.com", unexpected: true }],
          ["/register", { username: "user@example.com", password: 123 }],
          ["/magic-link", { email: "user@example.com", code: 123 }],
          ["/magic-link", { email: "user@example.com", code: "email-code", returnToken: "true" }],
          ["/magic-link", { id: "link-id", unexpected: true }],
          ["/magic-link", []],
        ] as const) {
          const response = await post(path, data);
          assert.equal(response.status, 400);
          const responseData: unknown = await response.json();
          assert(isObject(responseData));
          assert.equal(responseData.success, false);
        }
        assert.deepEqual({ registrationCalls, loginCalls, verificationCalls }, callsBefore);
        const oldClientRegistration = await post("/register", {
          username: "user@example.com",
          password: "password123",
          remember_me: false,
          totp_token: "",
        });
        assert.equal(oldClientRegistration.status, 200);
        await oldClientRegistration.arrayBuffer();
      });

      await context.test("invalid callback results become a typed server error", async () => {
        for (const invalidResult of [
          undefined,
          null,
          false,
          { success: true, code: "email-verified" },
        ]) {
          registrationResult = invalidResult;
          assert.deepEqual(
            await register({
              username: "user@example.com",
              password: "password123",
            }),
            {
              success: false,
              code: "server-error",
            },
          );
        }
        registrationResult = {
          success: true,
          code: "email-verification-code-sent",
        };
      });

      await context.test(
        "callback exceptions preserve HTTP status and public error responses",
        async () => {
          for (const [route, expectedResponse] of [
            ["/login", { success: false, code: "server-error" }],
            [
              "/register",
              {
                success: false,
                code: "server-error",
                message: "Failed to send email",
              },
            ],
          ] as const) {
            const response = await post(route, {
              username: "error@example.com",
              password: "password123",
            });
            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), expectedResponse);
          }
        },
      );

      await context.test("registration validation retains its domain error codes", async () => {
        const callsBefore = registrationCalls;
        for (const [data, expectedCode] of [
          [{ username: "" }, "username-missing"],
          [{ username: "user@example.com" }, "password-missing"],
          [{ username: "user@example.com", password: "short" }, "weak-password"],
        ] as const) {
          const response = await post("/register", data);
          assert.equal(response.status, 400);
          const result: unknown = await response.json();
          assert(isObject(result));
          assert.equal(result.success, false);
          assert.equal(result.code, expectedCode);
        }
        assert.equal(registrationCalls, callsBefore);
      });

      await context.test("magic-link request validation uses common auth errors", async () => {
        const callsBefore = verificationCalls;
        const invalidRequests: Record<string, string>[] = [
          {},
          { id: "" },
          { id: "link-id", returnToken: "true" },
          { email: "user@example.com" },
          { code: "email-code" },
          { email: "user@example.com", code: "" },
          { email: "", code: "email-code" },
        ];
        for (const data of invalidRequests) {
          for (const response of [
            await post("/magic-link", data),
            await fetch(endpoint + "/magic-link?" + new URLSearchParams(data).toString()),
          ]) {
            assert.equal(response.status, 400);
            const result: unknown = await response.json();
            assert(isObject(result));
            assert.equal(result.success, false);
            assert.equal(result.code, "something-went-wrong");
          }
        }
        assert.equal(verificationCalls, callsBefore);
      });

      await context.test("magic-link callback responses retain their HTTP statuses", async () => {
        for (const [code, expectedStatus, expectedResponse] of [
          ["email-code", 200, { success: true, code: "email-verified" }],
          ["expired-code", 401, { success: false, code: "expired-otp-code" }],
          ["invalid-result", 401, { success: false, code: "server-error" }],
          ["error-code", 400, { success: false, code: "something-went-wrong" }],
        ] as const) {
          const response = await post("/magic-link", {
            email: "user@example.com",
            code,
          });
          assert.equal(response.status, expectedStatus);
          assert.deepEqual(await response.json(), expectedResponse);
        }
      });

      await context.test("unconfigured auth operations remain unavailable", () => {
        const unavailableAuth = getAuthHandler({
          ...authOptions,
          authData: undefined,
        });
        assert.equal(unavailableAuth.login, undefined);
        assert.equal(unavailableAuth.signupWithEmailAndPassword, undefined);
        assert.equal(unavailableAuth.confirmEmail, undefined);
        assert.equal(unavailableAuth.isLoggedin, false);
      });

      await context.test(
        "password, TOTP and recovery login preserve redirects and cookies",
        async () => {
          assert.deepEqual(await login({ username: "user@example.com", password: "wrong" }), {
            success: false,
            code: "invalid-password",
          });
          const credentials = { username: "totp@example.com", password: "password123" };
          assert.deepEqual(await login(credentials), {
            success: false,
            code: "totp-token-missing",
          });
          assert.deepEqual(await login({ ...credentials, totp_token: "wrong" }), {
            success: false,
            code: "invalid-totp-code",
          });
          for (const data of [
            { username: "user@example.com", password: "password123" },
            { ...credentials, totp_token: "123456" },
            { ...credentials, totp_recovery_code: "recovery-code" },
          ]) {
            assert.deepEqual(await login(data), { success: true, redirect_url: endpoint + "/" });
          }
          const response = await post("/login", {
            username: "user@example.com",
            password: "password123",
          });
          assert.equal(response.status, 302);
          assert.match(
            response.headers.get("set-cookie") ?? "",
            /session_id=auth-contract-session/,
          );
          await response.arrayBuffer();
        },
      );

      await context.test(
        "magic links support GET, redirects and explicit token responses",
        async () => {
          for (const path of [
            "/magic-link/link-id",
            "/magic-link/link-id?returnToken=true",
            "/magic-link?id=link-id&returnURL=%2Fjson",
            "/magic-link?email=user%40example.com&code=login-code",
          ]) {
            const response = await fetch(endpoint + path, { redirect: "manual" });
            assert.equal(response.status, 302);
            assert.match(
              response.headers.get("set-cookie") ?? "",
              /session_id=auth-contract-session/,
            );
            assert.equal(
              response.headers.get("location"),
              path.includes("returnURL") ? "/json" : "/",
            );
            await response.arrayBuffer();
          }
          const response = await post("/magic-link", {
            email: "user@example.com",
            code: "login-code",
            returnToken: true,
          });
          assert.deepEqual(await response.json(), { success: true, token: session.sid });
          assert.deepEqual(await confirmEmail({ email: "user@example.com", code: "login-code" }), {
            success: true,
            redirect_url: endpoint + "/",
          });
        },
      );

      await context.test(
        "the client rejects malformed JSON contracts and preserves plain HTTP errors",
        async () => {
          const paths = ["/malformed", "/invalid-status", "/plain-error"].flatMap((path) => [
            path,
            `/redirect${path}`,
          ]);
          for (const path of paths) {
            const malformedAuth = getAuthHandler({
              ...authOptions,
              authData: {
                ...authData,
                login: { mode: "email+password", loginRoute: path, logoutRoute: "/logout" },
              },
            });
            assert(malformedAuth.login);
            const response = await malformedAuth.login({ username: "user@example.com" });
            assert.equal(response.success, false);
            assert.equal(response.code, "something-went-wrong");
            if (path.endsWith("/plain-error")) {
              assert.equal(response.message, "Upstream unavailable");
            } else {
              assert(
                response.message?.startsWith(
                  "Unexpected authentication response was sent by the server: ",
                ),
              );
            }
          }
        },
      );

      await context.test("logout retains its HTTP redirect result", async () => {
        const authenticated = getAuthHandler({
          ...authOptions,
          authData: { ...authData, user: { id: "user", type: "default" } },
        });
        assert(authenticated.isLoggedin);
        assert.deepEqual(await authenticated.logout(), {
          success: true,
          redirect_url: endpoint + "/",
        });
      });
    } finally {
      socket.close();
      await instance?.destroy();
      await db.none("DROP SCHEMA auth_contract_test CASCADE");
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
};

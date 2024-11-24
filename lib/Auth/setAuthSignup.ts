import { Auth } from './AuthTypes';
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { AuthSocketSchema, getKeys, isDefined, isEmpty } from "prostgles-types";

export const setAuthSignup = ({ registrations, app }: Required<Auth>["expressConfig"]) => {
  if(!registrations) return;
  const { email, onRegister, websiteUrl, ...providers } = registrations;
  if(email){
    app.post("/signup", async (req, res) => {
      const { username, password } = req.body;
      if(typeof username !== "string" || typeof password !== "string"){
        res.status(400).json({ msg: "Invalid username or password" });
        return;
      }
      await onRegister({ provider: "email", profile: { username, password }});
    })
  }

  if(!isEmpty(providers)){
    app.use(passport.initialize());
  }

  ([
    providers.google && {
      providerName: "google"  as const,
      config: providers.google,
      strategy: GoogleStrategy,
    }, 
    providers.github && {
      providerName: "github"  as const,
      config: providers.github,
      strategy: GitHubStrategy,
    },
    providers.facebook && {
      providerName: "facebook"  as const,
      config: providers.facebook,
      strategy: FacebookStrategy,
    },
    providers.microsoft && {
      providerName: "microsoft"  as const,
      config: providers.microsoft,
      strategy: MicrosoftStrategy,
    }
  ])
  .filter(isDefined)
  .forEach(({
    config: { authOpts, ...config },
    strategy,
    providerName,
  }) => {

    const callbackPath = `/auth/${providerName}/callback`;
    passport.use(
      new (strategy as typeof GoogleStrategy)(
        {
          ...config as any,
          callbackURL: `${websiteUrl}${callbackPath}`,
        },
        async (accessToken, refreshToken, profile, done) => {
          // This callback is where you would normally store or retrieve user info from the database
          await onRegister({ provider: providerName as "google", accessToken, refreshToken, profile });
          return done(null, profile);
        }
      )
    );

    app.get(`/auth/${providerName}`,
      passport.authenticate(providerName, authOpts)
    );

    app.get(callbackPath,
      passport.authenticate(providerName, { failureRedirect: '/' }),
      (req, res) => {
        // Successful authentication, redirect to main page
        res.redirect('/');
      }
    );
  });
}

export const getProviders = (registrations: Required<Auth>["expressConfig"]["registrations"]): AuthSocketSchema["providers"] | undefined => {
  if(!registrations) return undefined;
  const { email, websiteUrl, onRegister, ...providers } = registrations;
  if(isEmpty(providers)) return undefined;
 
  const result: AuthSocketSchema["providers"] = {}
  getKeys(providers).forEach(providerName => {
    if(providers[providerName]?.clientID){
      result[providerName] = {
        url: `/auth/${providerName}`,
      }
    }
  });

  return result;
}
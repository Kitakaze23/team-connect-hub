import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Mail, Lock, UserPlus, LogIn, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "login" | "register";
type Role = "user" | "admin";

const AuthPage = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock auth - will be replaced with Cloud auth
    toast({
      title: mode === "login" ? "Вход выполнен" : "Регистрация успешна",
      description: `Добро пожаловать в Терминал!`,
    });
    navigate("/app");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="inline-flex items-center gap-3 mb-4"
          >
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Terminal className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight">
              Терминал
            </h1>
          </motion.div>
          <p className="text-muted-foreground text-sm">
            Сервис для общения и координации команды
          </p>
        </div>

        {/* Auth Card */}
        <div className="glass rounded-2xl p-8 shadow-lg">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-secondary rounded-xl p-1">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="w-4 h-4" />
              Войти
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Регистрация
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: mode === "login" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === "login" ? 20 : -20 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 bg-secondary/50 border-border"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Пароль
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 bg-secondary/50 border-border"
                    required
                  />
                </div>
              </div>

              {mode === "register" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label className="text-sm font-medium">Роль</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("user")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
                        role === "user"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:border-accent/50"
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Пользователь
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("admin")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all ${
                        role === "admin"
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted-foreground hover:border-accent/50"
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      Администратор
                    </button>
                  </div>
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl"
              >
                {mode === "login" ? "Войти" : "Зарегистрироваться"}
              </Button>
            </motion.form>
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <span className="font-mono text-accent">$</span> Терминал v1.0 — Координация без хаоса
        </p>
      </motion.div>
    </div>
  );
};

export default AuthPage;

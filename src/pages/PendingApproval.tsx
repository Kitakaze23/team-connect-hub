import { motion } from "framer-motion";
import { Terminal, Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const PendingApproval = () => {
  const { membership, signOut, refreshMembership } = useAuth();

  const isRejected = membership?.status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        <div className="inline-flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Terminal className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-mono font-bold text-foreground tracking-tight">Терминал</h1>
        </div>

        <div className="glass rounded-2xl p-8 shadow-lg">
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
            isRejected ? "bg-destructive/10" : "bg-accent/10"
          }`}>
            <Clock className={`w-8 h-8 ${isRejected ? "text-destructive" : "text-accent"}`} />
          </div>

          {isRejected ? (
            <>
              <h2 className="text-lg font-mono font-bold text-foreground mb-2">Запрос отклонён</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Администратор компании «{membership?.company_name}» отклонил ваш запрос на вступление.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-mono font-bold text-foreground mb-2">Ожидание одобрения</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Ваш запрос на вступление в компанию «{membership?.company_name}» отправлен администратору.
                Вы получите доступ после одобрения.
              </p>
            </>
          )}

          <div className="flex gap-2">
            <Button onClick={refreshMembership} variant="outline" className="flex-1 rounded-xl">
              <RefreshCw className="w-4 h-4 mr-2" /> Обновить
            </Button>
            <Button onClick={signOut} variant="ghost" className="rounded-xl">
              <LogOut className="w-4 h-4 mr-2" /> Выйти
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PendingApproval;

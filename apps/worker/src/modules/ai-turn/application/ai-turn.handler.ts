import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiKeyCipher, MessageBus } from '@quem/cloud';
import {
  AiReplyEvent,
  AiSeatContext,
  AiTurnRequestedEvent,
  AiUnavailableReason,
  TOPICS,
} from '@quem/shared';
import { WORKER_CONFIG, WorkerConfig } from '../../../config/worker-config';
import { MESSAGE_BUS, RANDOM } from '../../../infrastructure/tokens';
import { BudgetService } from '../../usage/application/budget.service';
import { breaksCharacter } from '../domain/character-check';
import { buildPrompt, cleanReply } from '../domain/prompt-builder';
import { decideReply, Random } from '../domain/reply-decision';
import { LlmConfigError, LlmProvider, LlmQuotaError } from '../infrastructure/llm/llm-provider';
import { createOwnKeyProvider } from '../infrastructure/llm/llm-provider.factory';

/**
 * Turno da IA: para cada IA da partida, decide se ela responde à mensagem
 * nova e, se sim, chama o LLM e publica a resposta para a API.
 *
 * Ordem dos controles de custo, do mais barato ao mais caro:
 *   decisão (sem custo) → disjuntor diário (uma consulta) → chamada ao LLM.
 */
@Injectable()
export class AiTurnHandler {
  private readonly logger = new Logger(AiTurnHandler.name);

  constructor(
    private readonly provider: LlmProvider,
    private readonly budget: BudgetService,
    private readonly cipher: ApiKeyCipher,
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  async handle(event: AiTurnRequestedEvent): Promise<void> {
    for (const seat of event.aiSeats) {
      const decision = decideReply(event, seat, this.config.limits, new Date(), this.random);
      if (!decision.reply) continue;
      const keepGoing = await this.reply(event, seat);
      if (!keepGoing) return;
    }
  }

  /** Devolve false quando a IA ficou indisponível e não adianta tentar as outras. */
  private async reply(event: AiTurnRequestedEvent, seat: AiSeatContext): Promise<boolean> {
    const ownKey = this.decryptOwnKey(seat);
    if (!ownKey) {
      const verdict = await this.budget.check();
      if (!verdict.allowed) {
        await this.publishUnavailable(event.matchId, verdict.reason);
        return false;
      }
    }

    const provider = ownKey ? createOwnKeyProvider(ownKey, this.config) : this.provider;
    const prompt = buildPrompt(event, seat, this.config.limits.contextMessages);

    let response;
    try {
      response = await provider.generate({
        ...prompt,
        maxOutputTokens: this.config.limits.maxOutputTokens,
      });
    } catch (error) {
      if (error instanceof LlmQuotaError) {
        // Com a chave do Mestre, a cota estourada é dele: não desliga o servidor.
        if (!ownKey) await this.budget.tripForQuota();
        await this.publishUnavailable(event.matchId, 'provider-quota');
        return false;
      }
      if (error instanceof LlmConfigError) {
        // Chave ou modelo errado: avisar a sala é melhor que a IA ficar muda.
        this.logger.error(`LLM sem acesso (${provider.name}): ${error.message}`);
        await this.publishUnavailable(event.matchId, 'provider-error');
        return false;
      }
      // Erro pontual (rede, timeout): perde só esta resposta.
      this.logger.warn(`LLM falhou (${provider.name}): ${(error as Error).message}`);
      return true;
    }

    await this.budget.record({
      matchId: event.matchId,
      provider: provider.name,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      ownKey: Boolean(ownKey),
    });

    const text = cleanReply(response.text, seat.pseudonym, event.settings.maxChars);
    if (!text) return true;

    const reply: AiReplyEvent = {
      type: 'ai.reply',
      matchId: event.matchId,
      seatId: seat.seatId,
      replyToMessageId: event.trigger.messageId,
      text,
      brokeCharacter: breaksCharacter(text),
      usage: response.usage,
      provider: provider.name,
    };
    await this.bus.publish(TOPICS.aiReplies, reply);
    return true;
  }

  private decryptOwnKey(seat: AiSeatContext): string | null {
    if (!seat.encryptedApiKey) return null;
    try {
      return this.cipher.decrypt(seat.encryptedApiKey);
    } catch {
      this.logger.warn('Chave própria do Mestre não pôde ser decifrada; usando a do servidor');
      return null;
    }
  }

  private async publishUnavailable(matchId: string, reason: AiUnavailableReason) {
    await this.bus.publish(TOPICS.aiReplies, { type: 'ai.unavailable', matchId, reason });
  }
}

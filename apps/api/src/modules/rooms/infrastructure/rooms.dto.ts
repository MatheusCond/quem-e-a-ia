import { GAME_RULES } from '@quem/shared';
import { IsString, Length } from 'class-validator';

/**
 * DTO validado pelo ValidationPipe, como um @Valid com Bean Validation no
 * Spring. As regras de verdade (moderação, espaços) ficam no domínio; aqui
 * só barramos lixo antes de chegar lá.
 */
export class NicknameDto {
  @IsString({ message: 'Escolha um apelido.' })
  @Length(1, GAME_RULES.maxNicknameChars * 2, {
    message: `O apelido pode ter até ${GAME_RULES.maxNicknameChars} caracteres.`,
  })
  nickname: string;
}

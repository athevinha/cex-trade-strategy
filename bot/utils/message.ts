import {decodeSymbol} from ".";
import {CampaignConfig} from "../type";

  export const formatReportInterval = (id: string, config: CampaignConfig, isStart: boolean, tradeAbleCrypto?: string[]) => {
    const currencies:string[] = (tradeAbleCrypto ? tradeAbleCrypto.map(token => decodeSymbol(token)) : config.tokenTradingMode?.split('/').map(token => decodeSymbol(token))) || []
    let report = isStart
      ? `<b>Start Trading ID:</b> <code>${id}</code>\n`
      : `<b>Trading ID:</b> <code>${id}</code>\n`;

    report += `• <b>Bar:</b> <code>${config.bar}</code>\n`;
    report += `• <b>Leve:</b> <code>${config.leve}</code>\n`;
    report += `• <b>Mgn mode:</b> <code>${config.mgnMode}</code>\n`;
    report += `• <b>Size:</b> <code>${config.sz}</code>\n`;
    report += `• <b>Delay:</b> <code>${config.intervalDelay}ms</code>\n`;
    report += `• <b>Variance:</b> <code>${config.variance ? `${config.variance !== 'auto' ? Number(config.variance) * 100 + '%' : 'auto'}` : 'N/A'}</code>\n`;
    report += `• <b>Slope:</b> <code>${config.slopeThresholdUp || "N/A"}</code> | <code>${config.slopeThresholdUnder || "N/A"}</code>\n`;
    report += `• <b>Ccys:</b> <code>${currencies.length}</code> (${currencies.slice(0,15).map(ccy => ` <code>${ccy}</code> `)})`;
  
    return report;
  };
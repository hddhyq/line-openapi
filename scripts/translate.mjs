#!/usr/bin/env node
/**
 * OpenAPI YAML 增量翻译脚本
 * 使用 Google Translate (免费) 将 description/summary/title 翻译为中文
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import yaml from 'js-yaml';

// 使用 google-translate-api-x (免费，无需 API Key)
import translate from 'google-translate-api-x';

const CACHE_FILE = './cache/translation-cache.json';
const SOURCE_DIR = '.';
const DIST_DIR = './dist';
const YAML_FILES = [
  'channel-access-token.yml',
  'insight.yml',
  'liff.yml',
  'manage-audience.yml',
  'messaging-api.yml',
  'module.yml',
  'module-attach.yml',
  'shop.yml',
  'webhook.yml'
];

// 需要翻译的字段
const TRANSLATE_FIELDS = ['description', 'summary', 'title'];

// 加载翻译缓存
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('Cache load failed, starting fresh');
  }
  return {};
}

// 保存翻译缓存
function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// 计算文本 hash
function hashText(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

// 翻译单个文本
async function translateText(text, cache) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return text;
  }
  
  // 跳过纯 URL 或代码
  if (text.startsWith('http') || text.startsWith('```')) {
    return text;
  }

  const hash = hashText(text);
  
  // 检查缓存
  if (cache[hash]) {
    return cache[hash];
  }

  try {
    // 添加延迟避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const result = await translate(text, { from: 'en', to: 'zh-CN' });
    const translated = result.text;
    
    // 保存到缓存
    cache[hash] = translated;
    console.log(`  翻译: "${text.substring(0, 50)}..." -> "${translated.substring(0, 50)}..."`);
    
    return translated;
  } catch (error) {
    console.error(`  翻译失败: ${error.message}`);
    return text; // 失败时保留原文
  }
}

// 递归遍历并翻译对象
async function translateObject(obj, cache, path = '') {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    const result = [];
    for (let i = 0; i < obj.length; i++) {
      result.push(await translateObject(obj[i], cache, `${path}[${i}]`));
    }
    return result;
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (TRANSLATE_FIELDS.includes(key) && typeof value === 'string') {
      result[key] = await translateText(value, cache);
    } else if (typeof value === 'object') {
      result[key] = await translateObject(value, cache, `${path}.${key}`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// 处理单个 YAML 文件
async function processFile(filename, cache) {
  const sourcePath = path.join(SOURCE_DIR, filename);
  const distPath = path.join(DIST_DIR, filename);

  console.log(`\n处理文件: ${filename}`);

  try {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const doc = yaml.load(content);
    
    const translated = await translateObject(doc, cache);
    
    const output = yaml.dump(translated, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });

    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(distPath, output, 'utf-8');
    console.log(`  完成: ${distPath}`);
    
  } catch (error) {
    console.error(`  处理失败: ${error.message}`);
  }
}

// 主函数
async function main() {
  console.log('=== OpenAPI 翻译脚本 ===\n');
  
  const cache = loadCache();
  const initialCacheSize = Object.keys(cache).length;
  console.log(`缓存已加载: ${initialCacheSize} 条记录`);

  for (const file of YAML_FILES) {
    await processFile(file, cache);
    // 每个文件处理完保存一次缓存
    saveCache(cache);
  }

  const finalCacheSize = Object.keys(cache).length;
  console.log(`\n=== 完成 ===`);
  console.log(`新增翻译: ${finalCacheSize - initialCacheSize} 条`);
  console.log(`缓存总计: ${finalCacheSize} 条`);
}

main().catch(console.error);

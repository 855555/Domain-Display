/**
 * 数据服务层，封装对数据文件的操作
 */

// 缓存数据，避免频繁API请求
const dataCache = new Map<string, any>();
// 缓存过期时间（毫秒）
const CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 5分钟
// 缓存过期时间戳
const cacheExpireTime = new Map<string, number>();

/**
 * 从服务器读取JSON数据
 * @param filename 文件名
 * @param defaultValue 默认值，如果文件不存在或读取失败
 * @param useCache 是否使用缓存
 */
export async function fetchData<T>(
  filename: string, 
  defaultValue: T,
  useCache: boolean = true
): Promise<T> {
  // 检查缓存
  if (useCache) {
    const now = Date.now();
    const expire = cacheExpireTime.get(filename) || 0;
    
    if (now < expire && dataCache.has(filename)) {
      console.log(`🔄 从缓存获取数据: ${filename}`);
      return dataCache.get(filename) as T;
    }
  }
  
  try {
    console.log(`📥 从服务器获取数据: ${filename}`);
    const response = await fetch(`/api/data?file=${encodeURIComponent(filename)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`❓ 文件不存在: ${filename}, 使用默认值`);
        return defaultValue;
      }
      throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (useCache) {
      // 更新缓存
      dataCache.set(filename, result.data);
      cacheExpireTime.set(filename, Date.now() + CACHE_EXPIRE_TIME);
    }
    
    return result.data as T;
  } catch (error) {
    console.error(`获取数据失败: ${filename}`, error);
    return defaultValue;
  }
}

/**
 * 保存数据到服务器
 * @param filename 文件名
 * @param data 要保存的数据
 * @param updateCache 是否更新缓存
 * @param maxRetries 最大重试次数
 */
export async function saveData<T>(
  filename: string, 
  data: T,
  updateCache: boolean = true,
  maxRetries: number = 2
): Promise<boolean> {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      console.log(`📤 保存数据到服务器: ${filename}${retries > 0 ? ` (重试: ${retries}/${maxRetries})` : ''}`);
      
      if (!filename) {
        console.error("❌ 保存失败: 文件名不能为空");
        return false;
      }
      
      if (data === undefined || data === null) {
        console.error("❌ 保存失败: 数据不能为空");
        return false;
      }
      
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          data,
        }),
        // 增加超时设置
        signal: AbortSignal.timeout(5000), // 5秒超时
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => `状态码: ${response.status}`);
        throw new Error(`保存失败: ${response.status} ${response.statusText}, ${errorText}`);
      }
      
      const result = await response.json().catch(() => ({ success: false }));
      
      if (!result.success) {
        throw new Error("响应表明保存失败");
      }
      
      if (updateCache) {
        // 更新缓存
        dataCache.set(filename, data);
        cacheExpireTime.set(filename, Date.now() + CACHE_EXPIRE_TIME);
      }
      
      console.log(`✅ 成功保存数据: ${filename}`);
      return true;
    } catch (error) {
      console.error(`❌ 保存数据失败 (${retries}/${maxRetries}): ${filename}`, error);
      
      retries++;
      if (retries <= maxRetries) {
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 5000);
        console.log(`⏱️ 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        return false;
      }
    }
  }
  
  return false;
}

/**
 * 删除数据文件
 * @param filename 文件名
 */
export async function deleteData(filename: string): Promise<boolean> {
  try {
    console.log(`🗑️ 删除数据文件: ${filename}`);
    const response = await fetch(`/api/data?file=${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`删除失败: ${response.status} ${response.statusText}`);
    }
    
    // 清除缓存
    dataCache.delete(filename);
    cacheExpireTime.delete(filename);
    
    return true;
  } catch (error) {
    console.error(`删除数据失败: ${filename}`, error);
    return false;
  }
}

/**
 * 获取所有JSON文件列表
 */
export async function listDataFiles(): Promise<string[]> {
  try {
    console.log('📋 获取数据文件列表');
    const response = await fetch('/api/data');
    
    if (!response.ok) {
      throw new Error(`获取文件列表失败: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.files || [];
  } catch (error) {
    console.error('获取数据文件列表失败', error);
    return [];
  }
}

/**
 * 清除指定文件的缓存
 * @param filename 文件名，如果为空则清除所有缓存
 */
export function clearCache(filename?: string): void {
  if (filename) {
    dataCache.delete(filename);
    cacheExpireTime.delete(filename);
    console.log(`🧹 清除缓存: ${filename}`);
  } else {
    dataCache.clear();
    cacheExpireTime.clear();
    console.log('🧹 清除所有缓存');
  }
}

/**
 * 检查缓存是否存在且有效
 * @param filename 文件名
 */
export function isCacheValid(filename: string): boolean {
  const now = Date.now();
  const expire = cacheExpireTime.get(filename) || 0;
  return now < expire && dataCache.has(filename);
} 
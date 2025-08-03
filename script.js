// 币安Alpha管理系统核心逻辑
// 全局变量：存储选中的回归日期
let selectedRegressionDates = [];

class BinanceAlphaManager {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('binanceAccounts')) || [];
        this.cycleStartDate = localStorage.getItem('cycleStartDate') || new Date().toISOString();
        this.currentCycle = parseInt(localStorage.getItem('currentCycle')) || 1;
        this.manualResetDays = parseInt(localStorage.getItem('manualResetDays')) || null;
        this.currentAirdropAccountId = null;
        this.editingAccountId = null;
        this.init();
    }

    init() {
        this.updateCycleInfo();
        this.renderTable();
        this.updateStats();
        this.startCycleTimer();
    }

    // 计算资金积分
    calculateFundScore(amount) {
        if (amount >= 10000) {
            return 3;
        } else if (amount >= 1000) {
            return 2;
        }
        return 0;
    }

    // 计算Alpha积分
    calculateAlphaScore(currentScore, dailyScore, regressionScore, regressionDate, createdAt = null) {
        // 计算从创建到现在的天数
        const now = new Date();
        const createdDate = createdAt ? new Date(createdAt) : new Date();
        const daysPassed = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        
        // 基础积分 = 当前分数 + (每日加分 × 经过天数)
        let totalScore = currentScore + (dailyScore * daysPassed);
        
        // 如果有回归日期，检查是否已到回归时间并加上回归分数
        if (regressionDate && regressionScore > 0) {
            const regressionDates = regressionDate.split(',').map(date => date.trim());
            const currentMonth = now.getMonth() + 1;
            const currentDay = now.getDate();
            const currentDateStr = String(currentMonth).padStart(2, '0') + '/' + String(currentDay).padStart(2, '0');
            
            // 计算匹配当前日期的回归日期数量（支持一天多次回归）
            const matchingDatesCount = regressionDates.filter(date => date === currentDateStr).length;
            if (matchingDatesCount > 0) {
                totalScore += regressionScore * matchingDatesCount;
            }
        }
        
        return Math.round(totalScore * 100) / 100; // 保留两位小数
    }

    // 获取积分等级
    getScoreLevel(alphaScore) {
        if (alphaScore >= 80) return { level: '优秀', class: 'score-high' };
        if (alphaScore >= 60) return { level: '良好', class: 'score-medium' };
        if (alphaScore >= 40) return { level: '一般', class: 'score-medium' };
        return { level: '待提升', class: 'score-low' };
    }

    // 添加账号
    addAccount(name, currentScore, dailyScore, regressionScore, regressionDate) {
        if (!name || currentScore === '' || dailyScore === '' || regressionScore === '') {
            alert('请填写完整信息');
            return;
        }

        if (this.accounts.find(acc => acc.name === name)) {
            alert('账号已存在');
            return;
        }

        const alphaScore = this.calculateAlphaScore(currentScore, dailyScore, regressionScore, regressionDate, null);
        
        const account = {
            id: Date.now(),
            name: name.trim(),
            currentScore: parseFloat(currentScore) || 0,
            dailyScore: parseFloat(dailyScore) || 0,
            regressionScore: parseFloat(regressionScore) || 0,
            alphaScore: alphaScore,
            regressionDate: regressionDate || '',
            resetDate: null, // 每个账号独立的重置日期
            scoreHistory: [{
                date: new Date().toISOString(),
                action: '账号创建',
                change: 0,
                alphaScore: alphaScore,
                description: `初始总积分: ${alphaScore}`
            }],
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        this.accounts.push(account);
        this.saveData();
        this.renderTable();
        this.updateStats();
        this.clearForm();
        
        // 清空选中的日期数组
        selectedRegressionDates = [];
    }

    // 删除账号
    deleteAccount(id) {
        if (confirm('确定要删除这个账号吗？')) {
            this.accounts = this.accounts.filter(acc => acc.id !== id);
            this.saveData();
            this.renderTable();
            this.updateStats();
        }
    }

    // 编辑账号
    editAccount(id) {
        const account = this.accounts.find(acc => acc.id === id);
        if (!account) return;
        
        // 填充表单
        document.getElementById('accountName').value = account.name;
        document.getElementById('currentScore').value = account.currentScore;
        document.getElementById('dailyScore').value = account.dailyScore;
        document.getElementById('regressionScore').value = account.regressionScore;
        document.getElementById('regressionDate').value = account.regressionDate ? account.regressionDate.join(', ') : '';
        
        // 加载已有的回归日期到选中数组
        selectedRegressionDates = account.regressionDate ? [...account.regressionDate] : [];
        updateDatesList();
        
        // 设置编辑模式
        this.editingAccountId = id;
        
        // 显示编辑模态框
        this.showEditModal();
    }
    
    // 显示编辑模态框
    showEditModal() {
        // 修改按钮文本和标题
        const addButton = document.querySelector('button[onclick="addAccount()"]');
        if (addButton) {
            addButton.textContent = '更新账号';
            addButton.setAttribute('onclick', 'updateAccount()');
        }
        
        // 修改表单标题（如果有的话）
        const formTitle = document.querySelector('.form-group h3');
        if (formTitle) {
            formTitle.textContent = '编辑账号';
        }
    }
    
    // 更新账号信息
    updateAccount() {
        if (!this.editingAccountId) return;
        
        const account = this.accounts.find(acc => acc.id === this.editingAccountId);
        if (!account) return;
        
        const name = document.getElementById('accountName').value;
        const currentScore = document.getElementById('currentScore').value;
        const dailyScore = document.getElementById('dailyScore').value;
        const regressionScore = document.getElementById('regressionScore').value;
        const regressionDate = document.getElementById('regressionDate').value;
        
        if (!name || currentScore === '' || dailyScore === '' || regressionScore === '') {
            alert('请填写完整信息');
            return;
        }
        
        // 计算新的Alpha积分
        const oldAlphaScore = account.alphaScore;
        const newAlphaScore = this.calculateAlphaScore(
            parseFloat(currentScore) || 0,
            parseFloat(dailyScore) || 0,
            parseFloat(regressionScore) || 0,
            regressionDate,
            account.createdAt
        );
        
        // 更新账号信息
        account.name = name.trim();
        account.currentScore = parseFloat(currentScore) || 0;
        account.dailyScore = parseFloat(dailyScore) || 0;
        account.regressionScore = parseFloat(regressionScore) || 0;
        account.alphaScore = newAlphaScore;
        account.regressionDate = regressionDate ? regressionDate.split(',').map(date => date.trim()) : [];
        account.lastUpdated = new Date().toISOString();
        
        // 记录积分变更历史
        if (oldAlphaScore !== newAlphaScore) {
            account.scoreHistory = account.scoreHistory || [];
            account.scoreHistory.push({
                date: new Date().toISOString(),
                action: '手动编辑',
                change: newAlphaScore - oldAlphaScore,
                alphaScore: newAlphaScore,
                description: `Alpha积分从 ${oldAlphaScore} 变更为 ${newAlphaScore}`
            });
        }
        
        this.saveData();
        this.renderTable();
        this.updateStats();
        this.clearForm();
        
        // 重置编辑模式
        this.editingAccountId = null;
        selectedRegressionDates = [];
        
        // 恢复按钮文本
        const updateButton = document.querySelector('button[onclick="updateAccount()"]');
        if (updateButton) {
            updateButton.textContent = '添加账号';
            updateButton.setAttribute('onclick', 'addAccount()');
        }
        
        // 恢复表单标题
        const formTitle = document.querySelector('.form-group h3');
        if (formTitle) {
            formTitle.textContent = '添加新账号';
        }
        
        alert('账号信息已更新！');
    }

    // 渲染表格
    renderTable() {
        const tbody = document.getElementById('accountTableBody');
        tbody.innerHTML = '';

        if (this.accounts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #6c757d; padding: 40px;">暂无账号数据，请添加账号</td></tr>';
            return;
        }

        // 按Alpha积分降序排列
        const sortedAccounts = [...this.accounts].sort((a, b) => {
            const aScore = this.calculateAlphaScore(a.currentScore, a.dailyScore, a.regressionScore, a.regressionDate, a.createdAt);
            const bScore = this.calculateAlphaScore(b.currentScore, b.dailyScore, b.regressionScore, b.regressionDate, b.createdAt);
            return bScore - aScore;
        });

        sortedAccounts.forEach(account => {
            const accountResetDays = this.getAccountResetDays(account);
            // 重新计算总积分确保准确性
            const currentAlphaScore = this.calculateAlphaScore(account.currentScore, account.dailyScore, account.regressionScore, account.regressionDate, account.createdAt);
            const scoreLevel = this.getScoreLevel(currentAlphaScore);
            
            const row = document.createElement('tr');
            
            // 计算今天的回归次数
            const todayRegressionCount = this.getTodayRegressionCount(account.regressionDate);
            
            // 美化回归日期显示
            let regressionDateDisplay = '未设置';
            if (account.regressionDate) {
                const regressionDates = account.regressionDate.split(',').map(date => date.trim());
                const uniqueDates = [...new Set(regressionDates)];
                
                if (uniqueDates.length <= 3) {
                    // 日期较少时，显示所有日期
                    regressionDateDisplay = uniqueDates.map(date => {
                        const count = regressionDates.filter(d => d === date).length;
                        return count > 1 ? `${date}(×${count})` : date;
                    }).join(', ');
                } else {
                    // 日期较多时，显示前3个和总数
                    const firstThree = uniqueDates.slice(0, 3).map(date => {
                        const count = regressionDates.filter(d => d === date).length;
                        return count > 1 ? `${date}(×${count})` : date;
                    }).join(', ');
                    regressionDateDisplay = `${firstThree}... 共${regressionDates.length}次`;
                }
            }
            
            // 重置天数显示：显示是独立设置还是全局设置
            const resetDaysDisplay = account.resetDate ? 
                `${accountResetDays}天(独立)` : `${accountResetDays}天(全局)`;
            
            row.innerHTML = `
                <td><strong><a href="#" onclick="alphaManager.showAccountDetail(${account.id}); return false;" style="color: #667eea; text-decoration: none;">${account.name}</a></strong></td>
                <td>${account.currentScore}分</td>
                <td>${account.dailyScore}分/天</td>
                <td style="color: ${todayRegressionCount > 0 ? '#28a745' : '#6c757d'}; font-weight: ${todayRegressionCount > 0 ? 'bold' : 'normal'};">今日${todayRegressionCount}次</td>
                <td class="${scoreLevel.class}">${currentAlphaScore}</td>
                <td class="${scoreLevel.class}">${scoreLevel.level}</td>
                <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${account.regressionDate || '未设置'}">${regressionDateDisplay}</td>
                <td>${resetDaysDisplay}</td>
                <td>
                    <button class="btn btn-primary" style="margin-right: 3px; padding: 4px 8px; font-size: 11px;" onclick="alphaManager.editAccount(${account.id})">编辑</button>
                    <button class="btn btn-success" style="margin-right: 3px; padding: 4px 8px; font-size: 11px;" onclick="alphaManager.showAirdropModal(${account.id})">空投领取</button>
                    <button class="btn btn-info" style="margin-right: 3px; padding: 4px 8px; font-size: 11px; background-color: #17a2b8; border-color: #17a2b8;" onclick="alphaManager.setAccountResetDate(${account.id})">设置重置</button>
                    <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="alphaManager.deleteAccount(${account.id})">删除</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // 更新统计信息
    updateStats() {
        // 统计数据已移除，此函数保留以防其他地方调用
        // 版本: 2024-12-31-v2
    }

    // 更新周期信息
    updateCycleInfo() {
        // 周期信息显示已移除，此函数保留以防其他地方调用
    }

    // 获取当前周期天数（北京时间，早上8点后算+1天）
    getCurrentCycleDay() {
        const startDate = new Date(this.cycleStartDate);
        
        // 获取北京时间
        const now = new Date();
        const beijingTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
        
        // 如果是早上8点前，则算前一天
        const beijingHour = beijingTime.getUTCHours();
        let adjustedDate = new Date(beijingTime);
        if (beijingHour < 8) {
            adjustedDate.setUTCDate(adjustedDate.getUTCDate() - 1);
        }
        
        const diffTime = Math.abs(adjustedDate - startDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return Math.min(diffDays, 15);
    }

    // 获取距离重置的天数（全局）
    getDaysUntilReset() {
        if (this.manualResetDays !== null) {
            return this.manualResetDays;
        }
        const cycleDay = this.getCurrentCycleDay();
        return Math.max(15 - cycleDay + 1, 0);
    }

    // 获取单个账号的重置天数
    getAccountResetDays(account) {
        if (account.resetDate) {
            const resetDate = new Date(account.resetDate);
            const now = new Date();
            const diffTime = resetDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return Math.max(diffDays, 0);
        }
        return this.getDaysUntilReset(); // 如果没有设置独立重置日期，使用全局设置
    }

    // 计算今天的回归次数
    getTodayRegressionCount(regressionDate) {
        if (!regressionDate) return 0;
        
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const currentDateStr = String(currentMonth).padStart(2, '0') + '/' + String(currentDay).padStart(2, '0');
        
        const regressionDates = regressionDate.split(',').map(date => date.trim());
        return regressionDates.filter(date => date === currentDateStr).length;
    }

    // 获取周期完成度
    getCycleProgress() {
        const cycleDay = this.getCurrentCycleDay();
        return Math.round((cycleDay / 15) * 100);
    }

    // 设置手动重置天数（全局）
    setManualResetDays() {
        const days = prompt('请输入全局重置天数（输入空值或0取消手动设置）:');
        if (days === null) return; // 用户取消
        
        const daysNum = parseInt(days);
        if (isNaN(daysNum) || daysNum <= 0) {
            this.manualResetDays = null;
            alert('已取消全局手动设置，将使用自动计算的重置天数');
        } else {
            this.manualResetDays = daysNum;
            alert(`已设置全局重置天数为 ${daysNum} 天`);
        }
        
        this.saveData();
        this.updateCycleInfo();
        this.renderTable();
    }

    // 设置单个账号的重置日期
    setAccountResetDate(accountId) {
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        const dateStr = prompt(`请输入 ${account.name} 的重置日期（格式：YYYY-MM-DD，输入空值取消设置）:`);
        if (dateStr === null) return; // 用户取消
        
        if (dateStr.trim() === '') {
            account.resetDate = null;
            alert(`已取消 ${account.name} 的独立重置日期设置`);
        } else {
            const resetDate = new Date(dateStr);
            if (isNaN(resetDate.getTime())) {
                alert('日期格式错误，请使用 YYYY-MM-DD 格式');
                return;
            }
            account.resetDate = resetDate.toISOString();
            alert(`已设置 ${account.name} 的重置日期为 ${dateStr}`);
        }
        
        this.saveData();
        this.renderTable();
    }

    // 重置周期
    resetCycle() {
        if (confirm('确定要重置当前周期吗？这将清空所有账号数据并开始新的15天周期。')) {
            this.accounts = [];
            this.cycleStartDate = new Date().toISOString();
            this.currentCycle += 1;
            this.saveData();
            this.init();
            alert(`已重置为第${this.currentCycle}周期`);
        }
    }

    // 启动周期计时器
    startCycleTimer() {
        // 每小时检查一次是否需要自动重置
        setInterval(() => {
            const daysUntilReset = this.getDaysUntilReset();
            if (daysUntilReset === 0) {
                // 自动进入下一个周期
                this.cycleStartDate = new Date().toISOString();
                this.currentCycle += 1;
                this.saveData();
                this.updateCycleInfo();
                alert(`自动进入第${this.currentCycle}周期！`);
            }
        }, 3600000); // 每小时检查一次

        // 每分钟更新显示
        setInterval(() => {
            this.updateCycleInfo();
        }, 60000);
    }

    // 显示账号详情
    showAccountDetail(id) {
        const account = this.accounts.find(acc => acc.id === id);
        if (!account) return;

        this.currentAccountId = id;
        
        // 设置模态框标题
        document.getElementById('modalAccountName').textContent = `${account.name} - 详细信息`;
        
        // 显示账号基本信息
        const regressionDateDisplay = account.regressionDate ?
            account.regressionDate : '未设置';
        
        // 重新计算当前总积分确保准确性
        const currentTotalScore = this.calculateAlphaScore(account.currentScore, account.dailyScore, account.regressionScore, account.regressionDate, account.createdAt);
        
        document.getElementById('modalAccountInfo').innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div><strong>当前分数:</strong> ${account.currentScore}分</div>
                <div><strong>每日加分:</strong> ${account.dailyScore}分/天</div>
                <div><strong>回归分数:</strong> ${account.regressionScore}分</div>
                <div><strong>当前总积分:</strong> ${currentTotalScore}分</div>
                <div><strong>回归日期:</strong> ${regressionDateDisplay}</div>
                <div><strong>创建时间:</strong> ${new Date(account.createdAt).toLocaleString('zh-CN')}</div>
            </div>
        `;
        
        // 显示积分历史
        this.renderScoreHistory(account);
        
        // 显示模态框
        document.getElementById('accountModal').style.display = 'block';
    }

    // 渲染积分历史
    renderScoreHistory(account) {
        const historyContainer = document.getElementById('scoreHistory');
        const history = account.scoreHistory || [];
        
        if (history.length === 0) {
            historyContainer.innerHTML = '<p style="color: #6c757d; text-align: center;">暂无积分变动记录</p>';
            return;
        }
        
        const historyHtml = history.reverse().map(record => {
            const changeClass = record.change > 0 ? 'score-high' : record.change < 0 ? 'score-low' : '';
            const changeText = record.change > 0 ? `+${record.change}` : record.change.toString();
            
            return `
                <div style="border-bottom: 1px solid #e9ecef; padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: #495057;">${record.action}</div>
                        <div style="font-size: 12px; color: #6c757d;">${record.description}</div>
                        <div style="font-size: 11px; color: #adb5bd;">${new Date(record.date).toLocaleString('zh-CN')}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="${changeClass}" style="font-weight: 600;">${changeText}分</div>
                        <div style="font-size: 12px; color: #6c757d;">总分: ${record.alphaScore}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        historyContainer.innerHTML = historyHtml;
    }

    // 显示空投领取模态框
    showAirdropModal(accountId) {
        const account = this.accounts.find(acc => acc.id === accountId);
        if (!account) return;
        
        this.currentAirdropAccountId = accountId;
        document.getElementById('airdropAccountName').textContent = account.name;
        
        // 设置默认日期为今天
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('airdropDate').value = today;
        
        document.getElementById('airdropModal').style.display = 'block';
    }

    // 领取空投扣分
    claimAirdrop() {
        if (!this.currentAccountId) return;
        
        const account = this.accounts.find(acc => acc.id === this.currentAccountId);
        if (!account) return;
        
        if (account.alphaScore < 15) {
            alert('积分不足，无法领取空投！');
            return;
        }
        
        if (confirm('确定领取空投吗？将扣除15分Alpha积分。')) {
            const oldScore = account.alphaScore;
            account.alphaScore -= 15;
            account.lastUpdated = new Date().toISOString();
            
            // 记录积分变更历史
            account.scoreHistory = account.scoreHistory || [];
            account.scoreHistory.push({
                date: new Date().toISOString(),
                action: '领取空投',
                change: -15,
                alphaScore: account.alphaScore,
                description: `领取空投扣除15分，从 ${oldScore} 变为 ${account.alphaScore}`
            });
            
            this.saveData();
            this.renderTable();
            this.updateStats();
            this.showAccountDetail(this.currentAccountId); // 刷新模态框
        }
    }

    // 自定义积分变动
    addCustomScore() {
        if (!this.currentAccountId) return;
        
        const account = this.accounts.find(acc => acc.id === this.currentAccountId);
        if (!account) return;
        
        const change = prompt('请输入积分变动（正数为增加，负数为减少）:');
        if (change === null || change === '') return;
        
        const changeValue = parseFloat(change);
        if (isNaN(changeValue)) {
            alert('请输入有效的数字！');
            return;
        }
        
        const reason = prompt('请输入变动原因:') || '自定义调整';
        
        const oldScore = account.alphaScore;
        account.alphaScore += changeValue;
        account.lastUpdated = new Date().toISOString();
        
        // 记录积分变更历史
        account.scoreHistory = account.scoreHistory || [];
        account.scoreHistory.push({
            date: new Date().toISOString(),
            action: '自定义调整',
            change: changeValue,
            alphaScore: account.alphaScore,
            description: `${reason}，从 ${oldScore} 变为 ${account.alphaScore}`
        });
        
        this.saveData();
        this.renderTable();
        this.updateStats();
        this.showAccountDetail(this.currentAccountId); // 刷新模态框
    }

    // 清空表单
    clearForm() {
        document.getElementById('accountName').value = '';
        document.getElementById('currentScore').value = '';
        document.getElementById('dailyScore').value = '';
        document.getElementById('regressionScore').value = '';
        document.getElementById('regressionDate').value = '';
        document.getElementById('regressionDatePicker').value = '';
        document.getElementById('datesList').innerHTML = '';
        selectedRegressionDates = [];
    }

    // 保存数据到本地存储
    saveData() {
        localStorage.setItem('binanceAccounts', JSON.stringify(this.accounts));
        localStorage.setItem('cycleStartDate', this.cycleStartDate);
        localStorage.setItem('currentCycle', this.currentCycle.toString());
        if (this.manualResetDays !== null) {
            localStorage.setItem('manualResetDays', this.manualResetDays.toString());
        }
    }

    // 导出数据
    exportData() {
        const data = {
            accounts: this.accounts,
            cycleStartDate: this.cycleStartDate,
            currentCycle: this.currentCycle,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `binance-alpha-data-cycle-${this.currentCycle}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 导入数据
    importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('导入数据将覆盖当前所有数据，确定继续吗？')) {
                    this.accounts = data.accounts || [];
                    this.cycleStartDate = data.cycleStartDate || new Date().toISOString();
                    this.currentCycle = data.currentCycle || 1;
                    this.saveData();
                    this.init();
                    alert('数据导入成功！');
                }
            } catch (error) {
                alert('数据格式错误，导入失败！');
            }
        };
        reader.readAsText(file);
    }
}

// 全局实例
const alphaManager = new BinanceAlphaManager();

// 全局函数
function addAccount() {
    const name = document.getElementById('accountName').value;
    const currentScore = document.getElementById('currentScore').value;
    const dailyScore = document.getElementById('dailyScore').value;
    const regressionScore = document.getElementById('regressionScore').value;
    const regressionDate = document.getElementById('regressionDate').value;
    
    alphaManager.addAccount(name, currentScore, dailyScore, regressionScore, regressionDate);
}

function updateAccount() {
    alphaManager.updateAccount();
}

function resetCycle() {
    alphaManager.resetCycle();
}

// 关闭账号详情模态框
function closeAccountModal() {
    document.getElementById('accountModal').style.display = 'none';
    alphaManager.currentAccountId = null;
}

// 关闭空投模态框
function closeAirdropModal() {
    document.getElementById('airdropModal').style.display = 'none';
    alphaManager.currentAirdropAccountId = null;
}

// 确认领取空投
 function confirmAirdrop() {
     if (!alphaManager.currentAirdropAccountId) return;
     
     const account = alphaManager.accounts.find(acc => acc.id === alphaManager.currentAirdropAccountId);
     if (!account) return;
     
     const airdropDate = document.getElementById('airdropDate').value;
     const airdropScore = parseFloat(document.getElementById('airdropScore').value) || 15;
     
     if (!airdropDate) {
         alert('请选择空投日期！');
         return;
     }
     
     if (airdropScore <= 0) {
         alert('请输入有效的奖励积分！');
         return;
     }
     
     // 计算当前总积分
     const currentTotalScore = alphaManager.calculateAlphaScore(account.currentScore, account.dailyScore, account.regressionScore, account.regressionDate, account.createdAt);
     
     if (currentTotalScore < airdropScore) {
         alert('当前总积分不足，无法领取空投！');
         return;
     }
     
     // 从当前分数中扣除空投积分
      const oldCurrentScore = account.currentScore;
      account.currentScore -= airdropScore;
      account.lastUpdated = new Date().toISOString();
      
      // 计算15天后的回归日期
       const regressionDate = new Date(airdropDate);
       regressionDate.setDate(regressionDate.getDate() + 15);
       const regressionDateStr = `${String(regressionDate.getMonth() + 1).padStart(2, '0')}/${String(regressionDate.getDate()).padStart(2, '0')}`;
       
       // 将回归日期添加到账号的回归日期字段中（支持同一天多次领取）
       if (account.regressionDate) {
           // 直接添加回归日期，允许重复（因为一天可能领取多个空投）
           account.regressionDate += `, ${regressionDateStr}`;
       } else {
           account.regressionDate = regressionDateStr;
       }
      
      // 记录积分变更历史
      account.scoreHistory = account.scoreHistory || [];
      account.scoreHistory.push({
          date: new Date().toISOString(),
          change: -airdropScore,
          reason: '空投领取',
          newScore: account.currentScore,
          description: `领取空投扣除${airdropScore}分，日期: ${airdropDate}，当前分数从 ${oldCurrentScore} 变为 ${account.currentScore}，回归日期: ${regressionDateStr}`
      });
     
     alphaManager.saveData();
     alphaManager.renderTable();
     alphaManager.updateStats();
     
     closeAirdropModal();
      alert(`空投领取成功！扣除${airdropScore}分，回归日期${regressionDateStr}已自动添加`);
 }

// 领取空投（保留原有功能）
function claimAirdrop() {
    alphaManager.claimAirdrop();
}

// 自定义积分变动
function addCustomScore() {
    alphaManager.addCustomScore();
}

// 添加回归日期
function addRegressionDate() {
    const datePicker = document.getElementById('regressionDatePicker');
    const selectedDate = datePicker.value;
    
    if (!selectedDate) return;
    
    // 转换为MM/DD格式
    const date = new Date(selectedDate);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${month}/${day}`;
    
    // 添加到选中日期数组
    selectedRegressionDates.push(formattedDate);
    
    // 更新显示
    updateDatesList();
    
    // 更新隐藏输入框的值
    document.getElementById('regressionDate').value = selectedRegressionDates.join(', ');
    
    // 清空日期选择器
    datePicker.value = '';
}

// 删除回归日期
function removeRegressionDate(index) {
    selectedRegressionDates.splice(index, 1);
    updateDatesList();
    document.getElementById('regressionDate').value = selectedRegressionDates.join(', ');
}

// 更新日期列表显示
function updateDatesList() {
    const datesList = document.getElementById('datesList');
    datesList.innerHTML = '';
    
    if (selectedRegressionDates.length === 0) {
        datesList.innerHTML = '<span style="color: #6c757d; font-style: italic;">暂无选择</span>';
        return;
    }
    
    selectedRegressionDates.forEach((date, index) => {
        const dateTag = document.createElement('span');
        dateTag.style.cssText = `
            display: inline-flex;
            align-items: center;
            background-color: #667eea;
            color: white;
            padding: 4px 8px;
            border-radius: 15px;
            font-size: 12px;
            margin: 2px;
        `;
        dateTag.innerHTML = `
            ${date}
            <button onclick="removeRegressionDate(${index})" style="
                background: none;
                border: none;
                color: white;
                margin-left: 5px;
                cursor: pointer;
                font-size: 14px;
                padding: 0;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            " title="删除">&times;</button>
        `;
        datesList.appendChild(dateTag);
    });
}

// 键盘快捷键支持
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') {
        addAccount();
    }
});

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化日期列表显示
    updateDatesList();
    
    // 添加导出导入按钮
    const controls = document.querySelector('.form-group');
    
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-primary';
    exportBtn.textContent = '导出数据';
    exportBtn.onclick = () => alphaManager.exportData();
    
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-primary';
    importBtn.textContent = '导入数据';
    importBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            if (e.target.files[0]) {
                alphaManager.importData(e.target.files[0]);
            }
        };
        input.click();
    };
    
    controls.appendChild(exportBtn);
    controls.appendChild(importBtn);
    

});
# 同心式绕组模型与验证

更新日期：2026-09-10。仅支持三相等匝、单层或双层；本实现覆盖可由连续同相线圈组变换得到的同心式布局。

## 公开依据

- [Ansys Maxwell：Concentric-type Windings](https://ansyshelp.ansys.com/public/Views/Secured/Electronics/v252/en/Subsystems/Maxwell/Content/Maxwell/ConcentrictypeWindings.htm)：同心式至少有一组包含两只或更多共中心线圈。其24槽4极示意图用于核对拓扑，不用于读取槽号。
- [JECRC Electrical Machine-II，Unit 1](https://jecrcfoundation.com/wp-content/uploads/notes/btech/Electrical%20Engineering/4th%20Semester/Electrical%20Machine-II/EM-II%20Unit-1.pdf)：印刷页20给出24槽4极单层半绕式展开图。图中A相线圈槽对为1–8、2–7、13–20、14–19，实际节距为7、5、7、5；已据此加入独立槽号断言。该断言不代表所有相的串接顺序均与教材相同。
- [Motor-CAD Winding Pattern](https://ansyshelp.ansys.com/public/Views/Secured/MotorCAD/v252/en/Motor-CAD_UG/MotorCAD/topics/windingpattern.html)：同心式Pole Throw表示一极内最大的线圈跨距，支持将界面的节距参数解释为最大节距。

## 生成与表示

叠绕的`pitch`仍表示每只线圈的固定节距。同心式的`pitch`表示最外圈最大节距；每只线圈另存带符号的`span`，满足去槽加span按槽数取模后等于回槽。图形走线、选中详情、线圈表及CSV均使用实际span。

生成器先寻找等节距基础方案，将相别、去回层及方向相同、去槽连续的线圈分组，再反转组内回槽配对。对于k只线圈，组内第i只线圈的新span为原span加`k−1−2i`。它保持组内共中心，并保留各槽层的带符号安匝分布。

自动最大节距候选从`min(Q−1, max(1, floor(Q/P)+ceil(Q/(3P))−1))`向下搜索。每个候选只检查有限个基础节距，必须至少形成一组两只以上嵌套线圈，且最大实际节距与输入一致。零节距、方向翻转及超过定子一周的线圈均拒绝。

这不是所有同心式拓扑的穷举。某些36槽8极单层方案及特殊整绕式、交叉式布局可能未被找到；`E_CONCENTRIC_NOT_FOUND`表示当前方法未找到，不能解释为物理上不可能。

## 并联及文件兼容

并联支路除匝数、电势和指定奇次谐波外，还必须具有相同的实际节距组成。例如24槽4极单层5/7节距的两个线圈可能具有相同基波电势，但不能仅据此将长短线圈拆成不同并联路。该预设支持1路或2路，4路返回`E_PATH_PARTITION`。节距组成检查仍不能替代实际电阻、电感及工艺误差校验。

新方案使用`winding-studio/v2`，明确保存`windingType`。旧v1方案继续按叠绕读取；v1中冒用同心式类型的文件拒绝。这样旧版也会拒绝未知的v2格式，避免把同心式最大节距误当成每只线圈的固定节距。CSV在原有列后增加`SpanSlots`和`CoilGroup`。

## 当前验证

- 40项自动化检查通过，覆盖公开24槽单层图例、双层及360槽模型、共中心、槽层占用、原槽安匝分布、支路节距组成、文件兼容及错误后状态保持。
- 新增同心式96组自动参数样本：70组生成并通过独立槽位、端点及共中心检查，26组返回具体拒绝原因。此扫描不是完整参数空间证明。
- 同心式54槽8极双层最大节距8、360槽12极双层最大节距39纳入展开图跨接、箭头及引线避让验证。
- 本地Chrome验证24槽4极单层预设、两路生成、U相4只线圈、单支路2只嵌套线圈及四路错误提示。
- 原54槽8极双层叠绕y6保持18只线圈/相、两路各9只，kw1=0.9409528389575208；四路仍因18不能被4整除而拒绝。

尚未运行Motor-CAD/Maxwell或完成用户实际工程验收，不声称与商业软件完全等价。最新发布版本、线上浏览器核验和会话终态记录在本地忽略文件`work/DELIVERY.json`。

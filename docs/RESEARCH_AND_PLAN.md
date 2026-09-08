# 绕组工作台：研究、实现计划及验收

日期：2026-09-08。任务要求：输入极数、槽数、并联路数、层数，生成可靠且清晰的电气线路图，支持单相过滤、流畅交互、具体错误代码和原因，以成熟软件的使用体验为对标。

## 调研结论（编码前）

1. [Ansys Motor-CAD Winding Pattern](https://ansyshelp.ansys.com/public/Views/Secured/MotorCAD/v252/en/Motor-CAD_UG/MotorCAD/topics/windingpattern.html)：公开参数包括相数、每线圈匝数、节距、并联支路、层数；展开、径向、相量及谐波应基于同一线圈数据模型。软件还包含同心式、自定义及发卡式等不同生成规则。公开文档不等于其商业内部源码。
2. [Motor-CAD Winding Feasibility](https://ansyshelp.ansys.com/public/Views/Secured/MotorCAD/v252/en/Motor-CAD_UG/MotorCAD/topics/windingfeasibility.html)：自动绕组检查 Q/(m·a)、P/a、Q/(m·gcd(P/2,Q)) 的整数条件；单层另有偶数槽与奇数节距条件。这些是其自动生成规则，不能把自动生成器范围外的组合一概说成物理不可能。
3. [SWAT-EM Theory](https://swat-em.readthedocs.io/en/latest/theory.html)、[GUI and generators](https://swat-em.readthedocs.io/en/latest/gui.html)：槽电势星形图用于分相；按带符号线圈边电势求和计算绕组系数，能够统一整槽、分数槽及短距绕组。槽安匝积分给出理想磁动势；它不是有限元磁密结果。独立公开数值样例：6槽2极单层节距3，kw1=1；12槽2极双层节距5，kw1≈0.933。
4. [SWAT-EM documented 12-slot/10-pole example](https://swat-em.readthedocs.io/_/downloads/en/latest/pdf/)：双层、节距1，kw1≈0.933，可并联路数1、2。以此核验分数槽集中绕组，而不能只用整槽案例。
5. [RMxprt Winding Editor](https://ansyshelp.ansys.com/public/Views/Secured/Electronics/v242/en/Subsystems/Maxwell/Content/PolyphaseWindingEditor.htm)、[Analyses Offered](https://ansyshelp.ansys.com/public/Views/Secured/Electronics/v242/en/Subsystems/Maxwell/Content/AnalysisOffered.htm)：自动排列之外，软件具有特殊单/双层编辑及优化。本项目必须把已验证能力与仍需商业软件对照的能力分开，不能自称完成全面替代。
6. [PyMotorCAD get_winding_coil](https://motorcad.docs.pyansys.com/version/stable/methods/_autosummary_Geometry/ansys.motorcad.core.motorcad_methods.MotorCAD.get_winding_coil.html)、[set_winding_coil](https://motorcad.docs.pyansys.com/version/stable/methods/_autosummary_Geometry/ansys.motorcad.core.motorcad_methods.MotorCAD.set_winding_coil.html)：公开接口以 phase/path/coil 和去回槽、槽内位置、匝数描述线圈。因此内部数据保存明确的有向去回槽和层号；导出中保持这些字段。未运行商业软件时，不声称已验证原生工程兼容。

## 数学约定与实现决策

- P 为极数，p=P/2；Q 为槽数；m 默认为3；a 为每相并联路数；y 为相差槽数（1→10的节距是9）。槽号1起，层号1起。
- 机械槽角 θs=2π(s−1)/Q，电角=pθs。第ν次电气空间谐波的线圈向量为 N[exp(jνpθgo)−exp(jνpθreturn)]。相向量为各线圈之和，kwν=|sum|/(2·sum(N))，不重复乘短距系数。
- 双层等节距：每槽出发一线圈，回边在另一层；以线圈电势星形图进行均匀相带分配并调整接线方向。单层：等节距槽图的偶环交替匹配，尝试相带偏移及匹配方案，再做独立占槽与相量验证。
- 并联：按等电势线圈类别分配，复核各支路匝数、基波复向量和奇次谐波。不能只把线圈总数平均分组。失败区分数值约束与算法未找到有效分组。
- 三相 Y/Δ 电气节点与线圈支路连接由同一网表构造。几何展开图显示位置；电气接线图显示真实串并联顺序及端子。
- 多层扩展若实现，须明确普通等节距层对叠加模型，不标成发卡焊接工艺生成器。

## 计划

1. 独立纯函数算法、类型、错误目录、已知基准和结构不变量测试。
2. 中文工程工作台：参数栏、示例、展开/电路/径向/相量视图、单相及支路过滤、线圈追踪、缩放、动效。
3. 谐波与理想MMF、工程检查、参数记录/恢复、JSON/CSV/SVG导出、研究说明。
4. 覆盖经典和分数槽输入、错误输入、串并联节点、不平衡、存取边界及高槽数性能；生产构建与本地可访问预览。
5. 通过验证后保存源码并私有发布，保留验收报告。浏览器视觉及操作QA仅在用户明确要求浏览器测试时进行。

## 完成证据要求

- 自动图必须能由输入重算，并能逐线圈核对去回槽/层/极性/匝数/支路。
- 单相过滤应用于图和表；错误返回 code/message/reason/fix，不给无效方案成功标志。
- 线路区分绕组边、串联引线、并联母线与外部端子，跨界槽保持对应。
- 对每种声称支持的生成类型有独立基准或不变量证据；导出可重新读入。
- 页面不是宣传页；首屏可以输入并看到有效结果；触屏/键盘/减少动态效果具备实现。
- “可用性不低于成熟软件”仍需真实用户场景、商用软件样本和浏览器验收，不能由自测通过直接推断。该要求未证实前，目标保持进行中。

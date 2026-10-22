export const WORKING_TOOLS_SOURCE = `root = Col([Title("学习工作台", "xl"), Caption("调整计划、管理任务，或把问题交给导师。"), SegmentedControl($view, [{value:"plan",label:"练习计划"},{value:"tasks",label:"任务清单"},{value:"ask",label:"向导师提问"}]), $view == "plan" ? planner : $view == "tasks" ? tasks : assistant])
$view = "plan"
$minutes = 20
$days = 5
$draft = ""
$tasks = ["复习函数"]
$status = "review"
$subject = "数学"
$question = ""
$materials = [{name:"函数与图像",status:"review"},{name:"概率基础",status:"done"}]
planner = Card([Title("让每一次练习都有方向", "lg"), Caption("修改时间与天数，下方结果和图表会即时更新。"), Input($minutes, "每天练习（分钟）", "number"), Slider($days, 1, 7, 1, "每周练习天数"), Text("每周总计 " + ($minutes * $days) + " 分钟", "lg", "ink", "semibold"), Visualization("bar", "每周练习时间", {categories:["本周"],series:[{name:"分钟",data:[$minutes * $days]}]}, "根据练习时间与天数更新的每周总分钟数")])
tasks = Card([Title("把想做的事，一件件完成", "lg"), Caption("添加任务并筛选资料，所有操作都在当前工具中完成。"), Input($draft, "新任务", "text", "下一步想学什么？"), Row([Button("添加任务", Action([@Set($tasks, @Append($tasks, $draft)), @Set($draft, "")]), "solid", null, null, null, $draft == ""), Button("清空任务", @Set($tasks, []), "outline")]), Text("任务数：" + @Count($tasks)), Text(@Join($tasks, " · ")), Divider(), Select($status, [{value:"review",label:"待复习"},{value:"done",label:"已完成"}], "资料状态"), Table([{key:"name",label:"学习资料"}], @Filter($materials, "status", "==", $status))])
assistant = Card([Title("带着问题，开始下一步", "lg"), Caption("填写后提交给导师，表单内容会随问题一同发送。"), Form([Input($subject, "学科"), TextArea($question, "你的问题", "描述想弄清楚的概念…", 3), Button("提交给导师", @ToAssistant("请根据表单中的学科和问题进行讲解"))])])`;

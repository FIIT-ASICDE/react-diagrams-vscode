import { GroupNode, type GroupNodeProps } from "@/app@shadcn/components/labeled-group-node";

export default function LabeledGroupNode(props: GroupNodeProps) {
	return <GroupNode 
		{...props} 
		label={props.label ?? props.data?.label as string}
		position={props.position ?? props.data?.position as GroupNodeProps["position"]}
	/>;
}